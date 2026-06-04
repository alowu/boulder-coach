import { describe, it, expect } from 'vitest'
import { aggregateVisits } from './stats'
import type { Visit } from './types'

const NOW = new Date('2026-06-04T12:00:00Z')

function v(p: Partial<Visit>): Visit {
  return {
    id: Math.random().toString(36),
    coach_id: 'c', athlete_id: 'a', visit_type: 'membership',
    started_at: NOW.toISOString(), ended_at: NOW.toISOString(),
    end_reason: 'coach', is_backdated: false, membership_decremented: false,
    payment_settled_at: null, duration_minutes: 60, is_active: false,
    ...p,
  }
}

describe('aggregateVisits', () => {
  it('пустой список → нули', () => {
    const s = aggregateVisits([], NOW)
    expect(s).toMatchObject({ totalVisits: 0, totalMinutes: 0, avgMinutes: 0, activeNow: 0, distinctAthletes: 0 })
  })

  it('суммы, среднее, активные, типы, уникальные спортсмены', () => {
    const s = aggregateVisits([
      v({ athlete_id: 'a1', duration_minutes: 60, visit_type: 'membership' }),
      v({ athlete_id: 'a1', duration_minutes: 120, visit_type: 'paid' }),
      v({ athlete_id: 'a2', duration_minutes: 30, ended_at: null, is_active: true }),
    ], NOW)
    expect(s.totalVisits).toBe(3)
    expect(s.totalMinutes).toBe(210)
    expect(s.avgMinutes).toBe(70)
    expect(s.activeNow).toBe(1)
    expect(s.distinctAthletes).toBe(2)
    expect(s.membershipVisits).toBe(2)
    expect(s.paidVisits).toBe(1)
  })

  it('last30 учитывает только последние 30 дней', () => {
    const old = new Date('2026-01-01T00:00:00Z').toISOString()
    const s = aggregateVisits([
      v({ started_at: NOW.toISOString() }),
      v({ started_at: old }),
    ], NOW)
    expect(s.last30).toBe(1)
  })
})
