import type { Visit } from './types'

export interface VisitStats {
  totalVisits: number
  totalMinutes: number
  avgMinutes: number
  activeNow: number
  last30: number
  distinctAthletes: number
  membershipVisits: number
  paidVisits: number
}

// Агрегаты по списку визитов (из представления v_visits). `now` параметризуем
// для тестируемости. SPEC §4.7.4 (число визитов, длительности, активность за период).
export function aggregateVisits(visits: Visit[], now: Date = new Date()): VisitStats {
  const total = visits.length
  const totalMinutes = visits.reduce((s, v) => s + (v.duration_minutes ?? 0), 0)
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000
  return {
    totalVisits: total,
    totalMinutes,
    avgMinutes: total ? Math.round((totalMinutes / total) * 10) / 10 : 0,
    activeNow: visits.filter((v) => v.is_active || v.ended_at === null).length,
    last30: visits.filter((v) => new Date(v.started_at).getTime() >= cutoff).length,
    distinctAthletes: new Set(visits.map((v) => v.athlete_id)).size,
    membershipVisits: visits.filter((v) => v.visit_type === 'membership').length,
    paidVisits: visits.filter((v) => v.visit_type === 'paid').length,
  }
}
