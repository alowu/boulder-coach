// Supabase Edge Function: delete-user
// Полностью удаляет пользователя (тренер уволился / спортсмен перестал ходить).
// Только для админа. Удаление auth.users каскадно убирает profiles и все связанные
// данные (FK ... on delete cascade): визиты, абонементы, связи, журнал, route_logs.
// service_role доступен в рантайме как SUPABASE_SERVICE_ROLE_KEY (в браузер не попадает).
//
// Деплой: Dashboard → Edge Functions → Create → имя "delete-user" → вставить код → Deploy.
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

    // вызывающий — админ?
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (!jwt) return json({ error: 'UNAUTHENTICATED' }, 401)
    const { data: caller, error: cErr } = await admin.auth.getUser(jwt)
    if (cErr || !caller.user) return json({ error: 'UNAUTHENTICATED' }, 401)
    const { data: me } = await admin.from('profiles').select('role').eq('id', caller.user.id).maybeSingle()
    if (me?.role !== 'admin') return json({ error: 'FORBIDDEN' }, 403)

    const { userId } = await req.json().catch(() => ({}))
    if (!userId || typeof userId !== 'string') return json({ error: 'USER_ID_REQUIRED' }, 400)
    if (userId === caller.user.id) return json({ error: 'CANNOT_DELETE_SELF' }, 400)

    const { error: dErr } = await admin.auth.admin.deleteUser(userId)
    if (dErr) { console.error('delete failed:', dErr); return json({ error: 'DELETE_FAILED' }, 500) }
    return json({ status: 'deleted' })
  } catch (e) {
    console.error('delete-user error:', e)
    return json({ error: 'INTERNAL_ERROR' }, 500)
  }
})
