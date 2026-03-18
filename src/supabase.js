import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

// БЕЗОПАСНОСТЬ: здесь должен быть ТОЛЬКО anon-ключ (начинается с eyJ..., роль "anon").
// Никогда не используйте service_role ключ — он попадёт в публичный JS-бандл.
// Проверить роль ключа: Supabase Dashboard → Settings → API → anon/public.
if (import.meta.env.DEV && SUPABASE_KEY) {
  try {
    // JWT payload содержит role — декодируем без верификации подписи (только для проверки)
    const payload = JSON.parse(atob(SUPABASE_KEY.split('.')[1]))
    if (payload.role === 'service_role') {
      console.error(
        '🚨 КРИТИЧЕСКАЯ ОШИБКА: В VITE_SUPABASE_KEY используется service_role ключ!\n' +
        'Этот ключ обходит Row Level Security и попадёт в публичный бандл.\n' +
        'Замените на anon/public ключ из Supabase Dashboard → Settings → API.'
      )
    }
  } catch { /* невалидный JWT — игнорируем */ }
}

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
