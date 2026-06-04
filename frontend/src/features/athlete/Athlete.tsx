import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useAuth } from '../../auth/auth'
import { supabase } from '../../lib/supabase'
import { endSession, myStats } from '../../lib/api'
import type { MyStats, Visit } from '../../lib/types'
import { formatDuration, formatDate } from '../../lib/format'
import { Badge, Button, Card, PageTitle, Spinner } from '../../components/ui'

export function MyQr() {
  const { userId } = useAuth()
  const [dataUrl, setDataUrl] = useState('')
  const [token, setToken] = useState('')

  useEffect(() => {
    if (!userId) return
    supabase.from('profiles').select('athlete_qr_token').eq('id', userId).maybeSingle().then(({ data }) => {
      const t = data?.athlete_qr_token as string | undefined
      if (!t) return
      setToken(t)
      QRCode.toDataURL(`bcoach://athlete/${t}`, { width: 320, margin: 2 }).then(setDataUrl)
    })
  }, [userId])

  return (
    <div>
      <PageTitle>Мой QR-код</PageTitle>
      <Card className="flex flex-col items-center text-center">
        {dataUrl ? <img src={dataUrl} alt="QR" className="rounded-lg" /> : <Spinner />}
        <p className="mt-3 text-sm text-slate-500">Покажите его тренеру для отметки посещения. Работает офлайн.</p>
        {dataUrl && (
          <a href={dataUrl} download="boulder-coach-qr.png" className="mt-3">
            <Button variant="secondary">Скачать PNG</Button>
          </a>
        )}
        {token && <p className="mt-2 break-all text-xs text-slate-300">{token}</p>}
      </Card>
    </div>
  )
}

const TYPE_RU = { membership: 'по абонементу', paid: 'разовый' } as const

export function MyCalendar() {
  const { userId } = useAuth()
  const [visits, setVisits] = useState<Visit[]>([])
  const [coaches, setCoaches] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!userId) return
    setLoading(true)
    const { data } = await supabase.from('v_visits').select('*').eq('athlete_id', userId).order('started_at', { ascending: false })
    const rows = (data as Visit[]) ?? []
    setVisits(rows)
    const ids = [...new Set(rows.map((r) => r.coach_id))]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id,display_name').in('id', ids)
      const map: Record<string, string> = {}
      for (const p of profs ?? []) map[p.id] = p.display_name ?? '—'
      setCoaches(map)
    }
    setLoading(false)
  }
  useEffect(() => { void load() }, [userId])

  async function finish(id: string) {
    await endSession(id)
    await load()
  }

  if (loading) return <Spinner />
  return (
    <div>
      <PageTitle>Мои посещения</PageTitle>
      {visits.length === 0 && <p className="text-sm text-slate-500">Пока нет посещений.</p>}
      <ul className="space-y-2">
        {visits.map((v) => (
          <li key={v.id}>
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{coaches[v.coach_id] ?? 'Тренер'}</div>
                  <div className="text-sm text-slate-500">{formatDate(v.started_at)}</div>
                </div>
                <div className="text-right">
                  <Badge color={v.visit_type === 'paid' ? 'amber' : 'green'}>{TYPE_RU[v.visit_type]}</Badge>
                  {v.is_active
                    ? <div className="mt-1 text-xs text-sky-600">тренировка идёт…</div>
                    : <div className="mt-1 text-xs text-slate-500">{formatDuration(v.duration_minutes ?? 0)}</div>}
                </div>
              </div>
              {v.is_active && <Button variant="secondary" className="mt-3 w-full" onClick={() => void finish(v.id)}>Завершить тренировку</Button>}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MyStatsScreen() {
  const [stats, setStats] = useState<MyStats | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { myStats().then(setStats).finally(() => setLoading(false)) }, [])
  if (loading) return <Spinner />
  return (
    <div>
      <PageTitle>Моя статистика</PageTitle>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Визитов" value={stats?.total_visits ?? 0} />
        <Stat label="Всего минут" value={stats?.total_minutes ?? 0} />
        <Stat label="Средняя (мин)" value={Number(stats?.avg_minutes ?? 0)} />
        <Stat label="Последний визит" value={stats?.last_visit ? formatDate(stats.last_visit) : '—'} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </Card>
  )
}
