import { supabase } from './supabase'
import type { PaymentDue, MyStats, Visit, VisitType, Role, Route, RouteStatus } from './types'

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

// Удаление пользователя админом (Edge Function delete-user, service_role).
export async function deleteUser(userId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-user', { body: { userId } })
  if (error) throw error
}

// ── Фаза 2: трассы ──────────────────────────────────────────────────────────
export async function listRoutes(): Promise<Route[]> {
  const { data, error } = await supabase.from('routes').select('*')
    .eq('is_active', true).order('plane', { ascending: true })
  if (error) throw error
  return (data as Route[]) ?? []
}

export async function createRoute(r: {
  wall_color?: string | null; grade_french?: string | null; hold_color?: string | null; plane: string
}): Promise<void> {
  const { error } = await supabase.from('routes').insert(r)
  if (error) throw error
}

export async function logClimb(
  visitId: string, routeId: string, athleteId: string, status: RouteStatus,
): Promise<void> {
  const { error } = await supabase.from('route_logs')
    .insert({ visit_id: visitId, route_id: routeId, athlete_id: athleteId, status })
  if (error) throw error
}

// route_logs со встроенным грейдом — для статистики по грейдам
export async function myClimbs(athleteId: string): Promise<Array<{ status: RouteStatus; grade: string | null }>> {
  const { data, error } = await supabase.from('route_logs')
    .select('status, routes(grade_french)')
    .eq('athlete_id', athleteId)
  if (error) throw error
  return ((data as any[]) ?? []).map((r) => ({
    status: r.status as RouteStatus,
    grade: (r.routes?.grade_french ?? null) as string | null,
  }))
}
