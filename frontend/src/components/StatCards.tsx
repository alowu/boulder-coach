import type { VisitStats } from '../lib/stats'
import { Card } from './ui'

export function StatCards({ s, showAthletes = false }: { s: VisitStats; showAthletes?: boolean }) {
  const items: Array<[string, number]> = [
    ['Визитов', s.totalVisits],
    ['Активных сейчас', s.activeNow],
    ['За 30 дней', s.last30],
    ['Всего минут', s.totalMinutes],
    ['Средняя (мин)', s.avgMinutes],
    ['По абонементу', s.membershipVisits],
    ['Разовых', s.paidVisits],
  ]
  if (showAthletes) items.splice(5, 0, ['Спортсменов', s.distinctAthletes])
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <Card key={label}>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-sm text-slate-500">{label}</div>
        </Card>
      ))}
    </div>
  )
}
