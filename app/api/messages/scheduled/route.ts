/**
 * app/api/messages/scheduled/route.ts
 * API para mensagens agendadas — CRUD.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const CreateSchema = z.object({
  conversationId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  phone: z.string().min(8),
  body: z.string().min(1).max(4096),
  scheduledAt: z.string().datetime(),
  channel: z.string().default('whatsapp'),
})

export async function POST(req: NextRequest) {
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

    const body = await req.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const { data, error } = await supabase
      .from('scheduled_messages')
      .insert({
        organization_id: profile.organization_id,
        conversation_id: parsed.data.conversationId ?? null,
        deal_id: parsed.data.dealId ?? null,
        contact_id: parsed.data.contactId ?? null,
        phone: parsed.data.phone,
        body: parsed.data.body,
        channel: parsed.data.channel,
        scheduled_at: parsed.data.scheduledAt,
        status: 'pending',
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, id: data.id })
  } catch (err) {
    console.error('[ScheduledMessages POST]', err)
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
    const conversationId = url.searchParams.get('conversationId')
    const dealId = url.searchParams.get('dealId')

    let query = supabase
      .from('scheduled_messages')
      .select('id, phone, body, scheduled_at, status, channel, created_at')
      .eq('organization_id', profile.organization_id)
      .eq('status', 'pending')
      .order('scheduled_at', { ascending: true })

    if (conversationId) query = query.eq('conversation_id', conversationId)
    if (dealId) query = query.eq('deal_id', dealId)

    const { data } = await query.limit(50)

    return NextResponse.json({ messages: data ?? [] })
  } catch (err) {
    console.error('[ScheduledMessages GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
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
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    await supabase
      .from('scheduled_messages')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .eq('status', 'pending')

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[ScheduledMessages DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
