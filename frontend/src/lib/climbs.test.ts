import { describe, it, expect } from 'vitest'
import { aggregateClimbs, gradeRank } from './climbs'

describe('gradeRank', () => {
  it('упорядочивает французские грейды', () => {
    expect(gradeRank('6A')).toBeLessThan(gradeRank('6B'))
    expect(gradeRank('6A')).toBeLessThan(gradeRank('6A+'))
    expect(gradeRank('6C')).toBeLessThan(gradeRank('7A'))
    expect(gradeRank('4C')).toBeLessThan(gradeRank('5A'))
  })
})

describe('aggregateClimbs', () => {
  it('считает пролазы, флеши, попытки и топ-грейд', () => {
    const s = aggregateClimbs([
      { status: 'flash', grade: '6A' },
      { status: 'top', grade: '6A' },
      { status: 'top', grade: '6B' },
      { status: 'attempt', grade: '7A' }, // попытка не засчитывается как пролаз
    ])
    expect(s.totalSends).toBe(3)
    expect(s.flashes).toBe(1)
    expect(s.attempts).toBe(1)
    expect(s.topGrade).toBe('6B')
    expect(s.byGrade).toEqual([
      { grade: '6B', sends: 1 },
      { grade: '6A', sends: 2 },
    ])
  })

  it('пустой ввод → нули', () => {
    expect(aggregateClimbs([])).toMatchObject({ totalSends: 0, flashes: 0, attempts: 0, topGrade: null })
  })
})
