import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  // Видимая подсказка в консоли, если .env не заполнен
  console.error('[boulder-coach] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY не заданы в .env')
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
