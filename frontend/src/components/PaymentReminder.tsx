import { useEffect, useState } from 'react'
import { useAuth } from '../auth/auth'
import { myPaymentDue, dismissPayment } from '../lib/api'
import type { PaymentDue } from '../lib/types'
import { Button, Card } from './ui'

// SPEC 4.5.5 / 4.6.3 — попап появляется при каждом входе, пока спортсмен не закроет.
export function PaymentReminder() {
  const { role } = useAuth()
  const [dues, setDues] = useState<PaymentDue[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (role !== 'athlete') return
    myPaymentDue().then(setDues).catch(() => {})
  }, [role])

  if (role !== 'athlete' || dues.length === 0) return null

  async function pay(coachId: string) {
    setBusy(coachId)
    try {
      await dismissPayment(coachId)
      setDues((d) => d.filter((x) => x.coach_id !== coachId))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-sm">
        <h2 className="mb-2 text-lg font-semibold">Не забудьте оплатить</h2>
        <p className="mb-3 text-sm text-slate-500">Напоминание будет появляться, пока вы не подтвердите оплату.</p>
        <ul className="space-y-2">
          {dues.map((d) => (
            <li key={d.coach_id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm">
                {d.coach_name ?? 'Тренер'} — <b>{Number(d.amount)}</b> ({d.unpaid_visits} визит.)
              </span>
              <Button onClick={() => void pay(d.coach_id)} disabled={busy === d.coach_id}>
                Оплатил(а)
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
