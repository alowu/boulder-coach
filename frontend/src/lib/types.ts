export type Role = 'admin' | 'coach' | 'athlete'
export type VisitType = 'membership' | 'paid'
export type EndReason = 'athlete' | 'coach' | 'admin' | 'auto'

export interface Profile {
  id: string
  role: Role
  display_name: string | null
  email: string | null
  athlete_qr_token: string
}

export interface Visit {
  id: string
  coach_id: string
  athlete_id: string
  visit_type: VisitType
  started_at: string
  ended_at: string | null
  end_reason: EndReason | null
  is_backdated: boolean
  membership_decremented: boolean
  payment_settled_at: string | null
  // из представления v_visits:
  is_active?: boolean
  duration_minutes?: number
}

export interface PaymentDue {
  coach_id: string
  coach_name: string | null
  unpaid_visits: number
  amount: number
}

export interface MyStats {
  total_visits: number
  total_minutes: number
  avg_minutes: number
  first_visit: string | null
  last_visit: string | null
}

// ── Фаза 2: трассы ──────────────────────────────────────────────────────────
export type RouteStatus = 'top' | 'flash' | 'attempt'

export interface Route {
  id: string
  wall_color: string | null
  grade_french: string | null
  hold_color: string | null
  plane: string // '1'..'12' | 'cave'
  is_active: boolean
  created_at?: string
}

export interface RouteLog {
  id: string
  visit_id: string
  route_id: string
  athlete_id: string
  status: RouteStatus
  created_at: string
}
