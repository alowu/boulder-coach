// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Мокаем зависимости компонента (auth и api — отдельные модули, легко подменяются).
const { mockUseAuth, mockMyDue, mockDismiss } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockMyDue: vi.fn(),
  mockDismiss: vi.fn(),
}))
vi.mock('../auth/auth', () => ({ useAuth: mockUseAuth }))
vi.mock('../lib/api', () => ({ myPaymentDue: mockMyDue, dismissPayment: mockDismiss }))

import { PaymentReminder } from './PaymentReminder'

describe('PaymentReminder', () => {
  beforeEach(() => {
    mockUseAuth.mockReset(); mockMyDue.mockReset(); mockDismiss.mockReset()
  })

  it('спортсмену с долгом показывает напоминание и закрывает по клику', async () => {
    mockUseAuth.mockReturnValue({ role: 'athlete' })
    mockMyDue.mockResolvedValue([{ coach_id: 'c1', coach_name: 'Тренер Б', unpaid_visits: 2, amount: 600 }])
    mockDismiss.mockResolvedValue(1)

    render(<PaymentReminder />)

    // напоминание появилось (после загрузки долгов)
    await screen.findByText('Не забудьте оплатить')

    // нажимаем «Оплатил(а)» → вызывается dismissPayment по нужному тренеру
    fireEvent.click(screen.getByRole('button', { name: /Оплатил/ }))
    expect(mockDismiss).toHaveBeenCalledWith('c1')

    // после закрытия напоминание исчезает
    await waitFor(() => expect(screen.queryByText('Не забудьте оплатить')).toBeNull())
  })

  it('не показывается тренеру', () => {
    mockUseAuth.mockReturnValue({ role: 'coach' })
    mockMyDue.mockResolvedValue([])
    const { container } = render(<PaymentReminder />)
    expect(container.firstChild).toBeNull()
    expect(mockMyDue).not.toHaveBeenCalled()
  })
})
