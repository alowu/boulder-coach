import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Role } from '../lib/types'

interface AuthState {
  session: Session | null
  userId: string | null
  email: string | null
  role: Role | null
  loading: boolean
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | undefined>(undefined)

function roleFromToken(session: Session | null): Role | null {
  if (!session?.access_token) return null
  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1]))
    const r = payload.user_role as Role | undefined
    return r ?? null
  } catch {
    return null
  }
}

async function roleFromProfiles(userId: string): Promise<Role | null> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  return (data?.role as Role) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function resolve(s: Session | null) {
      if (!active) return
      setSession(s)
      if (!s?.user) {
        setRole(null)
        setLoading(false)
        return
      }
      const fromToken = roleFromToken(s)
      if (fromToken) {
        setRole(fromToken)
        setLoading(false)
      } else {
        const r = await roleFromProfiles(s.user.id)
        if (active) {
          setRole(r)
          setLoading(false)
        }
      }
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => resolve(s))
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      userId: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
      role,
      loading,
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, role, loading],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within <AuthProvider>')
  return v
}

export function ProtectedRoute({ allow, children }: { allow?: Role[]; children: ReactNode }) {
  const { session, role, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="p-8 text-center text-slate-500">Загрузка…</div>
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (allow && role && !allow.includes(role)) return <Navigate to="/" replace />
  return <>{children}</>
}
