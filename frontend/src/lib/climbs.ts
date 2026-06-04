import type { RouteStatus } from './types'

export interface ClimbStats {
  totalSends: number // top + flash
  flashes: number
  attempts: number
  byGrade: Array<{ grade: string; sends: number }> // по убыванию сложности
  topGrade: string | null
}

// Ранг французского грейда для сортировки/«топ-грейда»: 6A=600, 6A+=605, 6B=610, 7A=700…
export function gradeRank(g: string): number {
  const m = g.match(/^(\d+)\s*([ABCabc])?\s*(\+)?/)
  if (!m) return 0
  const num = parseInt(m[1], 10)
  const letter = m[2] ? ({ a: 0, b: 1, c: 2 }[m[2].toLowerCase()] ?? 0) : 0
  const plus = m[3] ? 5 : 0
  return num * 100 + letter * 10 + plus
}

// SPEC §4.8.4: статистика по грейдам (число пролазов, разбивка, топ-грейд).
export function aggregateClimbs(
  climbs: Array<{ status: RouteStatus; grade: string | null }>,
): ClimbStats {
  const sends = climbs.filter((c) => c.status === 'top' || c.status === 'flash')
  const byGradeMap = new Map<string, number>()
  for (const c of sends) {
    if (!c.grade) continue
    byGradeMap.set(c.grade, (byGradeMap.get(c.grade) ?? 0) + 1)
  }
  const byGrade = [...byGradeMap.entries()]
    .map(([grade, s]) => ({ grade, sends: s }))
    .sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade))
  return {
    totalSends: sends.length,
    flashes: climbs.filter((c) => c.status === 'flash').length,
    attempts: climbs.filter((c) => c.status === 'attempt').length,
    byGrade,
    topGrade: byGrade.length ? byGrade[0].grade : null,
  }
}
