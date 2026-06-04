import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { listRoutes, createRoute } from '../../lib/api'
import type { Route } from '../../lib/types'
import { Badge, Button, Card, ErrorText, Input, Label, PageTitle, Select, Spinner } from '../../components/ui'

export const GRADES = ['4C', '5A', '5B', '5C', '6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+']
export const PLANES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'cave']

export function planeLabel(p: string): string {
  return p === 'cave' ? 'пещера' : `плоскость ${p}`
}

export function RoutesCatalog() {
  const { role } = useAuth()
  const canEdit = role === 'coach' || role === 'admin'
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [grade, setGrade] = useState('6A')
  const [plane, setPlane] = useState('1')
  const [hold, setHold] = useState('')
  const [wall, setWall] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    setLoading(true)
    try { setRoutes(await listRoutes()) } catch (e) { setMsg((e as Error).message) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  async function add() {
    setMsg('')
    try {
      await createRoute({ grade_french: grade, plane, hold_color: hold || null, wall_color: wall || null })
      setOpen(false); setHold(''); setWall(''); await load()
    } catch (e) { setMsg((e as Error).message) }
  }

  if (loading) return <Spinner />
  return (
    <div>
      <PageTitle>Трассы</PageTitle>
      {canEdit && (
        <Card className="mb-4">
          {!open ? (
            <Button className="w-full" onClick={() => setOpen(true)}>Добавить трассу</Button>
          ) : (
            <div className="space-y-2">
              <div><Label>Грейд</Label><Select value={grade} onChange={(e) => setGrade(e.target.value)}>{GRADES.map((g) => <option key={g} value={g}>{g}</option>)}</Select></div>
              <div><Label>Плоскость</Label><Select value={plane} onChange={(e) => setPlane(e.target.value)}>{PLANES.map((p) => <option key={p} value={p}>{p === 'cave' ? 'пещера' : p}</option>)}</Select></div>
              <div><Label>Цвет зацепок</Label><Input value={hold} onChange={(e) => setHold(e.target.value)} placeholder="напр. жёлтый" /></div>
              <div><Label>Цвет/категория (опц.)</Label><Input value={wall} onChange={(e) => setWall(e.target.value)} /></div>
              <div className="flex gap-2"><Button onClick={() => void add()}>Добавить</Button><Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button></div>
              <ErrorText>{msg}</ErrorText>
            </div>
          )}
        </Card>
      )}
      {routes.length === 0 && <p className="text-sm text-slate-500">Трасс пока нет.</p>}
      <ul className="space-y-2">
        {routes.map((r) => (
          <li key={r.id}>
            <Card className="flex items-center justify-between">
              <div>
                <div className="font-medium">{r.grade_french ?? '—'}{r.hold_color ? ` · ${r.hold_color}` : ''}</div>
                <div className="text-xs text-slate-500">{planeLabel(r.plane)}{r.wall_color ? ` · ${r.wall_color}` : ''}</div>
              </div>
              <Badge color="sky">{r.grade_french ?? '—'}</Badge>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
