import type { Visit } from '../lib/types'
import { formatDate, formatDuration } from '../lib/format'
import { Badge, Card } from './ui'

export function VisitList({
  visits, names, coachNames,
}: {
  visits: Visit[]
  names?: Record<string, string>
  coachNames?: Record<string, string>
}) {
  if (!visits.length) return <p className="text-sm text-slate-500">Пока нет тренировок.</p>
  return (
    <ul className="space-y-2">
      {visits.map((v) => (
        <li key={v.id}>
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{names?.[v.athlete_id] ?? 'Спортсмен'}</div>
                <div className="text-sm text-slate-500">
                  {formatDate(v.started_at)}
                  {coachNames ? ` · ${coachNames[v.coach_id] ?? 'Тренер'}` : ''}
                </div>
              </div>
              <div className="text-right">
                <Badge color={v.visit_type === 'paid' ? 'amber' : 'green'}>
                  {v.visit_type === 'paid' ? 'разовый' : 'абонемент'}
                </Badge>
                <div className="mt-1 text-xs text-slate-500">
                  {v.is_active || v.ended_at === null ? 'идёт…' : formatDuration(v.duration_minutes ?? 0)}
                </div>
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  )
}
