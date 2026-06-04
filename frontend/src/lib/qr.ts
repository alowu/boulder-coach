const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/

// Извлекает athlete_qr_token (UUID) из содержимого QR.
// Поддерживает формат `bcoach://athlete/<uuid>` и «голый» UUID. Иначе — null.
export function parseQrToken(text: string): string | null {
  if (!text) return null
  return text.match(UUID_RE)?.[0] ?? null
}
