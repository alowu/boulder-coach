import { describe, it, expect } from 'vitest'
import { parseQrToken } from './qr'

const UUID = '11111111-2222-3333-4444-555555555555'

describe('parseQrToken', () => {
  it('извлекает токен из bcoach://athlete/<uuid>', () => {
    expect(parseQrToken(`bcoach://athlete/${UUID}`)).toBe(UUID)
  })
  it('принимает «голый» UUID', () => {
    expect(parseQrToken(UUID)).toBe(UUID)
  })
  it('возвращает null для мусора и пустой строки', () => {
    expect(parseQrToken('просто текст')).toBeNull()
    expect(parseQrToken('https://example.com/foo')).toBeNull()
    expect(parseQrToken('')).toBeNull()
  })
})
