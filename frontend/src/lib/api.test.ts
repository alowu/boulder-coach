import { describe, it, expect, vi, beforeEach } from 'vitest'

// Мокаем supabase-клиент целиком — проверяем только маппинг RPC-вызовов.
vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from './supabase'
import { checkin, grantMembership, dismissPayment, resolveQr, myPaymentDue } from './api'

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>

describe('api RPC wrappers', () => {
  beforeEach(() => rpc.mockReset())

  it('checkin → app_checkin с корректными параметрами', async () => {
    rpc.mockResolvedValue({ data: { id: 'v1' }, error: null })
    const v = await checkin('ath1', 'membership')
    expect(rpc).toHaveBeenCalledWith('app_checkin', { p_athlete: 'ath1', p_visit_type: 'membership' })
    expect(v).toEqual({ id: 'v1' })
  })

  it('grantMembership → p_coach=null по умолчанию', async () => {
    rpc.mockResolvedValue({ data: 5, error: null })
    await grantMembership('ath1', 5)
    expect(rpc).toHaveBeenCalledWith('app_grant_membership', { p_athlete: 'ath1', p_n: 5, p_coach: null })
  })

  it('бросает ошибку при error от supabase', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('boom') })
    await expect(dismissPayment('c1')).rejects.toThrow('boom')
  })

  it('resolveQr → null когда токен не найден', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await resolveQr('tok')).toBeNull()
  })

  it('myPaymentDue → [] когда data пустая', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await myPaymentDue()).toEqual([])
  })
})
