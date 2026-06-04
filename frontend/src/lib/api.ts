import { supabase } from './supabase'
import type { PaymentDue, MyStats, Visit, VisitType, Role } from './types'

// ── RPC-обёртки (бизнес-логика и контроль доступа — в БД) ──────────────────

export async function checkin(athleteId: string, visitType: VisitType): Promise<Visit> {
  const { data, error } = await supabase.rpc('app_checkin', {
    p_athlete: athleteId, p_visit_type: visitType,
  })
  if (error) throw error
  return data as Visit
}

export async function resolveQr(token: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('app_resolve_qr', { p_token: token })
  if (error) throw error
  return (data as string) ?? null
}

export async function grantMembership(athleteId: string, n: number, coachId?: string): Promise<number> {
  const { data, error } = await supabase.rpc('app_grant_membership', {
    p_athlete: athleteId, p_n: n, p_coach: coachId ?? null,
  })
  if (error) throw error
  return data as number
}

export async function endSession(visitId: string): Promise<Visit> {
  const { data, error } = await supabase.rpc('app_end_session', { p_visit: visitId })
  if (error) throw error
  return data as Visit
}

export async function dismissPayment(coachId: string): Promise<number> {
  const { data, error } = await supabase.rpc('app_dismiss_payment', { p_coach: coachId })
  if (error) throw error
  return data as number
}

export async function backdateVisit(
  athleteId: string, startedAt: string, endedAt: string, visitType: VisitType,
): Promise<Visit> {
  const { data, error } = await supabase.rpc('app_backdate_visit', {
    p_athlete: athleteId, p_started: startedAt, p_ended: endedAt, p_visit_type: visitType,
  })
  if (error) throw error
  return data as Visit
}

export async function myPaymentDue(): Promise<PaymentDue[]> {
  const { data, error } = await supabase.rpc('app_my_payment_due')
  if (error) throw error
  return (data as PaymentDue[]) ?? []
}

export async function coachDue(athleteId: string): Promise<number> {
  const { data, error } = await supabase.rpc('app_coach_due', { p_athlete: athleteId })
  if (error) throw error
  return (data as number) ?? 0
}

export async function myStats(): Promise<MyStats | null> {
  const { data, error } = await supabase.rpc('app_my_stats')
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return (row as MyStats) ?? null
}

export async function setRole(userId: string, role: Role): Promise<void> {
  const { error } = await supabase.rpc('app_set_role', { p_user: userId, p_role: role })
  if (error) throw error
}
