import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/auth'
import { Button } from './ui'
import type { Role } from '../lib/types'

interface NavItem { to: string; label: string }

const NAV: Record<Role, NavItem[]> = {
  athlete: [
    { to: '/qr', label: 'Мой QR' },
    { to: '/calendar', label: 'Посещения' },
    { to: '/stats', label: 'Статистика' },
  ],
  coach: [
    { to: '/scan', label: 'Скан' },
    { to: '/athletes', label: 'Спортсмены' },
    { to: '/routes', label: 'Трассы' },
    { to: '/coach-stats', label: 'Статистика' },
    { to: '/settings', label: 'Настройки' },
  ],
  admin: [
    { to: '/admin/overview', label: 'Обзор' },
    { to: '/admin/coaches', label: 'Тренеры' },
    { to: '/admin/users', label: 'Пользователи' },
    { to: '/routes', label: 'Трассы' },
  ],
}

const ROLE_RU: Record<Role, string> = { admin: 'админ', coach: 'тренер', athlete: 'спортсмен' }

export function Layout({ children }: { children: ReactNode }) {
  const { role, email, signOut } = useAuth()
  const items = role ? NAV[role] : []

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧗</span>
          <span className="font-semibold">boulder-coach</span>
          {role && <span className="text-xs text-slate-400">· {ROLE_RU[role]}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-400 sm:inline">{email}</span>
          <Button variant="ghost" onClick={() => void signOut()}>Выйти</Button>
        </div>
      </header>

      <main className="flex-1 p-4 pb-24">{children}</main>

      {items.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl border-t border-slate-200 bg-white">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                `flex-1 py-3 text-center text-sm ${isActive ? 'font-semibold text-sky-600' : 'text-slate-500'}`
              }
            >
              {it.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
