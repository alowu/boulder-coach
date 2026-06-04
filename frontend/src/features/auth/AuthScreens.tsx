import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/auth'
import { Button, Card, ErrorText, Input, Label } from '../../components/ui'

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center p-6">
      <div className="mb-6 text-center">
        <div className="text-3xl">🧗</div>
        <h1 className="mt-2 text-xl font-semibold">boulder-coach</h1>
      </div>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </Card>
    </div>
  )
}

export function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setErr('Неверный e-mail или пароль')
    else nav('/', { replace: true })
  }

  async function google() {
    setErr('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setErr('Вход через Google недоступен')
  }

  return (
    <Shell title="Вход">
      <form onSubmit={submit} className="space-y-3">
        <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><Label>Пароль</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        <Button type="submit" className="w-full" disabled={busy}>Войти</Button>
        <ErrorText>{err}</ErrorText>
      </form>
      <div className="my-3 text-center text-xs text-slate-400">или</div>
      <Button variant="secondary" className="w-full" onClick={() => void google()}>Войти через Google</Button>
      <div className="mt-4 flex justify-between text-sm">
        <Link to="/register" className="text-sky-600">Регистрация</Link>
        <Link to="/reset" className="text-slate-500">Забыли пароль?</Link>
      </div>
    </Shell>
  )
}

export function Register() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    // Если подтверждение e-mail включено — сессии нет, просим проверить почту.
    if (data.session) nav('/', { replace: true })
    else setSent(true)
  }

  return (
    <Shell title="Регистрация спортсмена">
      {sent ? (
        <p className="text-sm text-slate-600">
          Мы отправили ссылку для подтверждения на <b>{email}</b>. Перейдите по ней,
          затем войдите. Если письма нет — проверьте папку «Спам» и правильность адреса.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Имя</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><Label>Пароль</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></div>
          <Button type="submit" className="w-full" disabled={busy}>Зарегистрироваться</Button>
          <ErrorText>{err}</ErrorText>
        </form>
      )}
      <div className="mt-4 text-sm">
        <Link to="/login" className="text-sky-600">Уже есть аккаунт? Войти</Link>
      </div>
    </Shell>
  )
}

export function ResetPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    // Анти-энумерация: сообщение одинаковое независимо от существования аккаунта.
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    setSent(true)
  }

  return (
    <Shell title="Сброс пароля">
      {sent ? (
        <p className="text-sm text-slate-600">
          Если такой аккаунт существует, на почту отправлена ссылка для сброса.
          Если вы не запрашивали сброс — ничего делать не нужно.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <Button type="submit" className="w-full">Отправить ссылку</Button>
        </form>
      )}
      <div className="mt-4 text-sm"><Link to="/login" className="text-sky-600">Назад ко входу</Link></div>
    </Shell>
  )
}

// Приём приглашения / сброса: пользователь приходит по ссылке из письма (сессия
// уже создана из токена в URL), здесь он задаёт пароль.
export function SetPassword() {
  const { session, loading } = useAuth()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setErr(error.message)
    else nav('/', { replace: true })
  }

  if (loading) return <Shell title="Задание пароля"><p className="text-sm text-slate-500">Загрузка…</p></Shell>
  if (!session) {
    return (
      <Shell title="Ссылка недействительна">
        <p className="text-sm text-slate-600">
          Ссылка-приглашение недействительна или истекла. Попросите администратора прислать новое.
        </p>
        <div className="mt-4 text-sm"><Link to="/login" className="text-sky-600">Ко входу</Link></div>
      </Shell>
    )
  }
  return (
    <Shell title="Задайте пароль">
      <p className="mb-3 text-sm text-slate-500">Вы приняли приглашение. Задайте пароль для входа.</p>
      <form onSubmit={submit} className="space-y-3">
        <div><Label>Новый пароль</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} required /></div>
        <Button type="submit" className="w-full" disabled={busy}>Сохранить и войти</Button>
        <ErrorText>{err}</ErrorText>
      </form>
    </Shell>
  )
}
