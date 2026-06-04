import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/auth'
import { Layout } from './components/Layout'
import { PaymentReminder } from './components/PaymentReminder'
import { Spinner } from './components/ui'
import type { Role } from './lib/types'
import { Login, Register, ResetPassword, SetPassword } from './features/auth/AuthScreens'
import { MyQr, MyCalendar, MyStatsScreen } from './features/athlete/Athlete'
import { Scan, Athletes, AthleteDetail, CoachSettings } from './features/coach/Coach'
import { AdminUsers, AdminCoaches } from './features/admin/Admin'

function ProtectedLayout() {
  const { session, loading } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  return (
    <Layout>
      <PaymentReminder />
      <Outlet />
    </Layout>
  )
}

function RoleGate({ allow, children }: { allow: Role[]; children: JSX.Element }) {
  const { role, loading } = useAuth()
  if (loading) return <Spinner />
  if (role && !allow.includes(role)) return <Navigate to="/" replace />
  return children
}

function HomeRedirect() {
  const { role, loading } = useAuth()
  if (loading) return <Spinner />
  if (role === 'athlete') return <Navigate to="/qr" replace />
  if (role === 'coach') return <Navigate to="/scan" replace />
  if (role === 'admin') return <Navigate to="/admin/users" replace />
  return <div className="p-8 text-center text-slate-500">Роль не назначена. Обратитесь к администратору.</div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route path="/set-password" element={<SetPassword />} />

      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/qr" element={<RoleGate allow={['athlete']}><MyQr /></RoleGate>} />
        <Route path="/calendar" element={<RoleGate allow={['athlete']}><MyCalendar /></RoleGate>} />
        <Route path="/stats" element={<RoleGate allow={['athlete']}><MyStatsScreen /></RoleGate>} />
        <Route path="/scan" element={<RoleGate allow={['coach', 'admin']}><Scan /></RoleGate>} />
        <Route path="/athletes" element={<RoleGate allow={['coach', 'admin']}><Athletes /></RoleGate>} />
        <Route path="/athletes/:athleteId" element={<RoleGate allow={['coach', 'admin']}><AthleteDetail /></RoleGate>} />
        <Route path="/settings" element={<RoleGate allow={['coach']}><CoachSettings /></RoleGate>} />
        <Route path="/admin/users" element={<RoleGate allow={['admin']}><AdminUsers /></RoleGate>} />
        <Route path="/admin/coaches" element={<RoleGate allow={['admin']}><AdminCoaches /></RoleGate>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
