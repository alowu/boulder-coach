// Supabase Edge Function: invite-coach
// Приглашает тренера по e-mail (или повышает уже зарегистрированного до coach).
// Только для админа. service_role доступен в рантайме как SUPABASE_SERVICE_ROLE_KEY
// и в браузер НЕ попадает. Смена роли — через RPC app_set_role_service (миграция 0006),
// т.к. под service_role нет JWT и триггер guard_profiles_update иначе заблокировал бы смену.
//
// Деплой: Supabase Dashboard → Edge Functions → Create → имя "invite-coach" → вставить код → Deploy.
// (Или CLI: `supabase functions deploy invite-coach`.)
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

    // 1) Вызывающий должен быть АДМИНОМ
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (!jwt) return json({ error: 'UNAUTHENTICATED' }, 401)
    const { data: caller, error: cErr } = await admin.auth.getUser(jwt)
    if (cErr || !caller.user) return json({ error: 'UNAUTHENTICATED' }, 401)
    const { data: me } = await admin.from('profiles').select('role').eq('id', caller.user.id).maybeSingle()
    if (me?.role !== 'admin') return json({ error: 'FORBIDDEN' }, 403)

    // 2) Вход
    const { email } = await req.json().catch(() => ({}))
    if (!email || typeof email !== 'string') return json({ error: 'EMAIL_REQUIRED' }, 400)

    // 3) Уже зарегистрирован? profiles.email теперь неизменяем+уникален (0006) → ему можно доверять
    const { data: existing } = await admin.from('profiles').select('id, role').eq('email', email).maybeSingle()
    if (existing) {
      if (existing.id === caller.user.id) return json({ error: 'CANNOT_INVITE_SELF' }, 400)
      if (existing.role === 'admin') return json({ error: 'TARGET_IS_ADMIN' }, 409)
      if (existing.role === 'coach') return json({ status: 'promoted' })   // уже тренер — no-op
      const { error: rErr } = await admin.rpc('app_set_role_service', { p_user: existing.id, p_role: 'coach' })
      if (rErr) { console.error('set_role(existing) failed:', rErr); return json({ error: 'ROLE_UPDATE_FAILED' }, 500) }
      return json({ status: 'promoted' })
    }

    // 4) Новый — приглашаем письмом и назначаем роль coach
    const origin = req.headers.get('origin') ?? url
    const { data: inv, error: iErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/set-password`,
    })
    if (iErr || !inv?.user) { console.error('invite failed:', iErr); return json({ error: 'INVITE_FAILED' }, 400) }
    const { error: rErr } = await admin.rpc('app_set_role_service', { p_user: inv.user.id, p_role: 'coach' })
    if (rErr) { console.error('set_role(new) failed:', rErr); return json({ error: 'ROLE_UPDATE_FAILED' }, 500) }
    return json({ status: 'invited' })
  } catch (e) {
    console.error('invite-coach error:', e)
    return json({ error: 'INTERNAL_ERROR' }, 500)
  }
})
