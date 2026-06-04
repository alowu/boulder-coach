import { describe, it, expect } from 'vitest'
import { formatDuration } from './format'

describe('formatDuration (SPEC 4.3.5)', () => {
  it('форматирует минуты как «X минут (~Hч Mrмин)»', () => {
    expect(formatDuration(95)).toBe('тренировка 95 минут (~1ч 35мин)')
    expect(formatDuration(60)).toBe('тренировка 60 минут (~1ч 0мин)')
    expect(formatDuration(125)).toBe('тренировка 125 минут (~2ч 5мин)')
    expect(formatDuration(0)).toBe('тренировка 0 минут (~0ч 0мин)')
  })
  it('отрицательные/дробные → не ниже 0, округление вниз', () => {
    expect(formatDuration(-5)).toBe('тренировка 0 минут (~0ч 0мин)')
    expect(formatDuration(90.9)).toBe('тренировка 90 минут (~1ч 30мин)')
  })
})
