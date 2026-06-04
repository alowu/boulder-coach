// SPEC 4.3.5 — формат длительности: «тренировка {M} минут (~{H}ч {Mr}мин)»
export function formatDuration(totalMinutes: number): string {
  const M = Math.max(0, Math.floor(totalMinutes))
  const H = Math.floor(M / 60)
  const Mr = M % 60
  return `тренировка ${M} минут (~${H}ч ${Mr}мин)`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
}
