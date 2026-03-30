/**
 * app/api/dispatch/mass/route.ts
 * API de disparo em massa — criar e iniciar disparos.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { renderTemplate, processMassDispatch } from '@/lib/dispatch/mass-sender'

const CreateDispatchSchema = z.object({
  name: z.string().min(1).max(200),
  messageTemplate: z.string().min(1).max(4096),
  targetFilter: z.object({
    tags: z.array(z.string()).optional(),
    stageIds: z.array(z.string()).optional(),
    boardIds: z.array(z.string()).optional(),
    allContacts: z.boolean().optional(),
  }),
  delaySeconds: z.number().min(10).max(600).default(120),
  channel: z.string().default('whatsapp'),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden — admin/manager only' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = CreateDispatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const { name, messageTemplate, targetFilter, delaySeconds, channel } = parsed.data
    const orgId = profile.organization_id

    // Buscar contatos que atendem ao filtro
    let contactsQuery = supabase
      .from('contacts')
      .select('id, first_name, last_name, phone')
      .eq('organization_id', orgId)
      .not('phone', 'is', null)
      .limit(1000)

    if (targetFilter.tags && targetFilter.tags.length > 0) {
      contactsQuery = contactsQuery.overlaps('tags', targetFilter.tags)
    }

    const { data: contacts, error: contactsError } = await contactsQuery
    if (contactsError) throw contactsError

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ error: 'Nenhum contato encontrado com os filtros aplicados' }, { status: 400 })
    }

    // Criar o disparo
    const { data: dispatch, error: dispatchError } = await supabase
      .from('mass_dispatches')
      .insert({
        organization_id: orgId,
        name,
        message_template: messageTemplate,
        target_filter: targetFilter,
        channel,
        delay_seconds: delaySeconds,
        status: 'pending',
        total_recipients: contacts.length,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (dispatchError || !dispatch) throw dispatchError ?? new Error('Failed to create dispatch')

    // Criar destinatários com mensagem já renderizada
    const recipients = contacts.map((c) => {
      const nome = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Cliente'
      const renderedMessage = renderTemplate(messageTemplate, {
        nome,
        empresa: nome,
        telefone: c.phone ?? '',
      })

      return {
        dispatch_id: dispatch.id,
        organization_id: orgId,
        contact_id: c.id,
        phone: c.phone!,
        name: nome,
        rendered_message: renderedMessage,
        status: 'pending',
      }
    })

    await supabase.from('mass_dispatch_recipients').insert(recipients)

    // Iniciar disparo em background (fire-and-forget)
    processMassDispatch(supabase, {
      dispatchId: dispatch.id,
      organizationId: orgId,
      delayMs: delaySeconds * 1000,
    }).catch((err) => console.error('[MassDispatch] Background error:', err))

    return NextResponse.json({
      success: true,
      dispatchId: dispatch.id,
      totalRecipients: contacts.length,
    })
  } catch (err) {
    console.error('[MassDispatch POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const url = new URL(req.url)
    const dispatchId = url.searchParams.get('id')

    if (dispatchId) {
      const { data } = await supabase
        .from('mass_dispatches')
        .select('*, mass_dispatch_recipients(count)')
        .eq('id', dispatchId)
        .eq('organization_id', profile.organization_id)
        .single()

      return NextResponse.json({ dispatch: data })
    }

    const { data } = await supabase
      .from('mass_dispatches')
      .select('id, name, status, total_recipients, sent_count, failed_count, created_at, completed_at')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })
      .limit(50)

    return NextResponse.json({ dispatches: data ?? [] })
  } catch (err) {
    console.error('[MassDispatch GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
