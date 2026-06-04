import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { setRole } from '../../lib/api'
import type { Role } from '../../lib/types'
import { Badge, Button, Card, ErrorText, Input, Label, PageTitle, Select, Spinner } from '../../components/ui'

interface UserRow { id: string; email: string | null; display_name: string | null; role: Role }

const ROLE_RU: Record<Role, string> = { admin: 'админ', coach: 'тренер', athlete: 'спортсмен' }

function useUsers() {
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('id,email,display_name,role').order('created_at', { ascending: true })
    setRows((data as UserRow[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  return { rows, loading, reload: load }
}

export function AdminUsers() {
  const { rows, loading, reload } = useUsers()
  const [msg, setMsg] = useState('')

  async function change(id: string, role: Role) {
    setMsg('')
    try { await setRole(id, role); await reload() }
    catch (e) { setMsg((e as Error).message) }
  }

  if (loading) return <Spinner />
  return (
    <div>
      <PageTitle>Пользователи</PageTitle>
      <ErrorText>{msg}</ErrorText>
      <ul className="space-y-2">
        {rows.map((u) => (
          <li key={u.id}>
            <Card className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{u.display_name ?? '—'}</div>
                <div className="truncate text-xs text-slate-500">{u.email}</div>
              </div>
              <Select value={u.role} onChange={(e) => void change(u.id, e.target.value as Role)} className="w-36">
                <option value="athlete">спортсмен</option>
                <option value="coach">тренер</option>
                <option value="admin">админ</option>
              </Select>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AdminCoaches() {
  const { rows, loading, reload } = useUsers()
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')

  async function invite() {
    setMsg(''); setOk('')
    const addr = email.trim()
    if (!addr) return
    const { data, error } = await supabase.functions.invoke('invite-coach', { body: { email: addr } })
    if (error) {
      setMsg('Не удалось пригласить. Убедитесь, что Edge Function «invite-coach» развёрнута в Supabase. ' + (error.message ?? ''))
      return
    }
    if (data?.status === 'invited') setOk(`Приглашение отправлено на ${addr}.`)
    else if (data?.status === 'promoted') setOk('Пользователь уже зарегистрирован — назначен тренером.')
    else setOk('Готово.')
    setEmail(''); await reload()
  }

  if (loading) return <Spinner />
  const coaches = rows.filter((r) => r.role === 'coach')
  return (
    <div>
      <PageTitle>Тренеры</PageTitle>
      <Card className="mb-4">
        <Label>Пригласить тренера по e-mail</Label>
        <p className="mb-2 text-xs text-slate-400">
          На указанный e-mail придёт приглашение. По ссылке тренер задаёт пароль и сразу входит как тренер.
          Если e-mail уже зарегистрирован — он будет назначен тренером без письма.
        </p>
        <div className="flex gap-2">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="coach@example.com" />
          <Button onClick={() => void invite()}>Пригласить</Button>
        </div>
        <ErrorText>{msg}</ErrorText>
        {ok && <p className="mt-2 text-sm text-green-700">{ok}</p>}
      </Card>

      <h2 className="mb-2 font-semibold">Текущие тренеры</h2>
      {coaches.length === 0 && <p className="text-sm text-slate-500">Пока нет тренеров.</p>}
      <ul className="space-y-2">
        {coaches.map((c) => (
          <li key={c.id}>
            <Card className="flex items-center justify-between">
              <div>
                <div className="font-medium">{c.display_name ?? '—'}</div>
                <div className="text-xs text-slate-500">{c.email}</div>
              </div>
              <Badge color="sky">{ROLE_RU[c.role]}</Badge>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
