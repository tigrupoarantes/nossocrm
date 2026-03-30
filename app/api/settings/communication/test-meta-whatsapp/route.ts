/**
 * POST /api/settings/communication/test-meta-whatsapp
 * Valida as credenciais da Meta WhatsApp Cloud API.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { testMetaCredentials } from '@/lib/communication/meta-whatsapp'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { phoneNumberId, accessToken } = body as { phoneNumberId?: string; accessToken?: string }

  if (!phoneNumberId || !accessToken) {
    return NextResponse.json({ error: 'phoneNumberId and accessToken are required' }, { status: 400 })
  }

  const result = await testMetaCredentials({ phoneNumberId, accessToken })

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Invalid credentials' }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    phoneNumber: result.phoneNumber,
    displayPhoneNumber: result.displayPhoneNumber,
  })
}
