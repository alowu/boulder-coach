import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'
import { useAuth } from '../../auth/auth'
import { supabase } from '../../lib/supabase'
import { checkin, resolveQr, grantMembership, endSession, coachDue } from '../../lib/api'
import { parseQrToken } from '../../lib/qr'
import type { Visit, VisitType } from '../../lib/types'
import { formatDate, formatDuration } from '../../lib/format'
import { Badge, Button, Card, ErrorText, Input, Label, PageTitle, Select, Spinner } from '../../components/ui'

// ── Сканирование + чек-ин ───────────────────────────────────────────────
export function Scan() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const [scanning, setScanning] = useState(false)
  const [athleteId, setAthleteId] = useState<string | null>(null)
  const [athleteName, setAthleteName] = useState('')
  const [msg, setMsg] = useState('')
  const [manual, setManual] = useState('')

  function stop() { controlsRef.current?.stop(); controlsRef.current = null; setScanning(false) }
  useEffect(() => () => stop(), [])

  async function start() {
    setMsg(''); setAthleteId(null); setScanning(true)
    try {
      const reader = new BrowserQRCodeReader()
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result) void handleText(result.getText())
      })
    } catch {
      setScanning(false)
      setMsg('Не удалось включить камеру. Используйте ручной ввод токена ниже.')
    }
  }

  async function handleText(text: string) {
    const token = parseQrToken(text)
    if (!token) { setMsg('QR не распознан'); return }
    stop()
    try {
      const id = await resolveQr(token)
      if (!id) { setMsg('QR не распознан'); return }
      const { data } = await supabase.from('profiles').select('display_name').eq('id', id).maybeSingle()
      setAthleteName(data?.display_name ?? 'Спортсмен')
      setMsg(''); setAthleteId(id)
    } catch { setMsg('QR не распознан') }
  }

  return (
    <div>
      <PageTitle>Отметить посещение</PageTitle>
      {!athleteId && (
        <Card>
          <video ref={videoRef} className="aspect-square w-full rounded-lg bg-slate-900 object-cover" muted playsInline />
          <div className="mt-3 flex gap-2">
            {!scanning
              ? <Button className="flex-1" onClick={() => void start()}>Включить камеру</Button>
              : <Button variant="secondary" className="flex-1" onClick={stop}>Остановить</Button>}
          </div>
          <ErrorText>{msg}</ErrorText>
          <div className="mt-4">
            <Label>Ручной ввод токена (если камера недоступна)</Label>
            <div className="flex gap-2">
              <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="UUID из-под QR" />
              <Button variant="secondary" onClick={() => void handleText(manual)}>ОК</Button>
            </div>
          </div>
        </Card>
      )}
      {athleteId && <CheckinDialog athleteId={athleteId} name={athleteName} onDone={() => { setAthleteId(null); }} />}
    </div>
  )
}

function CheckinDialog({ athleteId, name, onDone }: { athleteId: string; name: string; onDone: () => void }) {
  const [type, setType] = useState<VisitType>('membership')
  const [done, setDone] = useState<Visit | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true); setErr('')
    try { setDone(await checkin(athleteId, type)) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">{name}</h2>
      {!done ? (
        <>
          <Label>Тип посещения</Label>
          <Select value={type} onChange={(e) => setType(e.target.value as VisitType)}>
            <option value="membership">По абонементу (списать 1)</option>
            <option value="paid">Разовый / платный</option>
          </Select>
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={() => void confirm()} disabled={busy}>Отметить приход</Button>
            <Button variant="ghost" onClick={onDone}>Отмена</Button>
          </div>
          <ErrorText>{err}</ErrorText>
        </>
      ) : (
        <>
          <p className="text-sm text-green-700">✓ Посещение отмечено {done.is_active ? '(тренировка идёт)' : ''}.</p>
          <Button className="mt-3 w-full" onClick={onDone}>Сканировать следующего</Button>
        </>
      )}
    </Card>
  )
}

// ── Список спортсменов ────────────────────────────────────────────────────
interface Row { athlete_id: string; name: string; remaining: number }

export function Athletes() {
  const { userId } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    ;(async () => {
      const { data: links } = await supabase.from('coach_athlete')
        .select('athlete_id').eq('coach_id', userId).is('removed_at', null)
      const ids = (links ?? []).map((l) => l.athlete_id as string)
      if (!ids.length) { setRows([]); setLoading(false); return }
      const [{ data: profs }, { data: mems }] = await Promise.all([
        supabase.from('profiles').select('id,display_name').in('id', ids),
        supabase.from('memberships').select('athlete_id,remaining_visits').eq('coach_id', userId).in('athlete_id', ids),
      ])
      const memMap: Record<string, number> = {}
      for (const m of mems ?? []) memMap[m.athlete_id as string] = m.remaining_visits as number
      setRows((profs ?? []).map((p) => ({ athlete_id: p.id, name: p.display_name ?? '—', remaining: memMap[p.id] ?? 0 })))
      setLoading(false)
    })()
  }, [userId])

  if (loading) return <Spinner />
  return (
    <div>
      <PageTitle>Мои спортсмены</PageTitle>
      {rows.length === 0 && <p className="text-sm text-slate-500">Отсканируйте QR спортсмена, чтобы он появился здесь.</p>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.athlete_id}>
            <Link to={`/athletes/${r.athlete_id}`}>
              <Card className="flex items-center justify-between hover:border-sky-300">
                <span className="font-medium">{r.name}</span>
                <Badge color={r.remaining > 0 ? 'green' : 'slate'}>абонемент: {r.remaining}</Badge>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Карточка спортсмена ─────────────────────────────────────────────────────
export function AthleteDetail() {
  const { athleteId = '' } = useParams()
  const { userId } = useAuth()
  const [name, setName] = useState('')
  const [remaining, setRemaining] = useState(0)
  const [due, setDue] = useState(0)
  const [visits, setVisits] = useState<Visit[]>([])
  const [grant, setGrant] = useState('1')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  async function load() {
    if (!userId) return
    setLoading(true)
    const [{ data: prof }, { data: mem }, { data: vis }, dueVal] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', athleteId).maybeSingle(),
      supabase.from('memberships').select('remaining_visits').eq('coach_id', userId).eq('athlete_id', athleteId).maybeSingle(),
      supabase.from('v_visits').select('*').eq('coach_id', userId).eq('athlete_id', athleteId).order('started_at', { ascending: false }),
      coachDue(athleteId).catch(() => 0),
    ])
    setName(prof?.display_name ?? 'Спортсмен')
    setRemaining((mem?.remaining_visits as number) ?? 0)
    setVisits((vis as Visit[]) ?? [])
    setDue(Number(dueVal) || 0)
    setLoading(false)
  }
  useEffect(() => { void load() }, [athleteId, userId])

  async function doGrant() {
    setMsg('')
    try { await grantMembership(athleteId, parseInt(grant, 10)); await load() }
    catch (e) { setMsg((e as Error).message) }
  }
  async function finish(id: string) { await endSession(id); await load() }
  async function remove() {
    if (!userId) return
    await supabase.from('coach_athlete').update({ removed_at: new Date().toISOString() })
      .eq('coach_id', userId).eq('athlete_id', athleteId)
    history.back()
  }

  if (loading) return <Spinner />
  return (
    <div>
      <PageTitle>{name}</PageTitle>
      <Card className="mb-3">
        <div className="flex items-center justify-between">
          <Badge color={remaining > 0 ? 'green' : 'slate'}>абонемент: {remaining}</Badge>
          {due > 0 && <Badge color="amber">к оплате: {due}</Badge>}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <Label>Начислить абонемент</Label>
            <Input type="number" min={1} max={100} value={grant} onChange={(e) => setGrant(e.target.value)} />
          </div>
          <Button onClick={() => void doGrant()}>Начислить</Button>
        </div>
        <ErrorText>{msg}</ErrorText>
        <Button variant="danger" className="mt-3 w-full" onClick={() => void remove()}>Удалить из моего списка</Button>
      </Card>

      <h2 className="mb-2 font-semibold">Посещения</h2>
      <ul className="space-y-2">
        {visits.map((v) => (
          <li key={v.id}>
            <Card>
              <div className="flex items-center justify-between">
                <span className="text-sm">{formatDate(v.started_at)}</span>
                <Badge color={v.visit_type === 'paid' ? 'amber' : 'green'}>{v.visit_type === 'paid' ? 'разовый' : 'абонемент'}</Badge>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {v.is_active ? 'тренировка идёт…' : formatDuration(v.duration_minutes ?? 0)}
              </div>
              {v.is_active && <Button variant="secondary" className="mt-2 w-full" onClick={() => void finish(v.id)}>Завершить</Button>}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Настройки тренера ───────────────────────────────────────────────────────
export function CoachSettings() {
  const { userId } = useAuth()
  const [price, setPrice] = useState('0')
  const [show, setShow] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    supabase.from('coach_settings').select('price_per_visit,show_payment_due').eq('coach_id', userId).maybeSingle()
      .then(({ data }) => {
        setPrice(String(data?.price_per_visit ?? 0))
        setShow(Boolean(data?.show_payment_due))
        setLoading(false)
      })
  }, [userId])

  async function save() {
    if (!userId) return
    setSaved(false)
    await supabase.from('coach_settings').update({
      price_per_visit: Number(price) || 0, show_payment_due: show,
    }).eq('coach_id', userId)
    setSaved(true)
  }

  if (loading) return <Spinner />
  return (
    <div>
      <PageTitle>Настройки</PageTitle>
      <Card className="space-y-3">
        <div>
          <Label>Цена за разовое посещение</Label>
          <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          <p className="mt-1 text-xs text-slate-400">При цене 0 сумма к оплате не показывается.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Показывать спортсменам сумму к оплате
        </label>
        <Button onClick={() => void save()}>Сохранить</Button>
        {saved && <p className="text-sm text-green-700">Сохранено.</p>}
      </Card>
    </div>
  )
}
