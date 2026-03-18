/**
 * Минималистичный i18n, совместимый с Vue I18n v9 API.
 * Когда vue-i18n будет установлен — заменить этот файл на:
 *
 *   import { createI18n } from 'vue-i18n'
 *   import ru from './ru'
 *   import en from './en'
 *   export const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru, en } })
 *   export function useI18n() { return i18n.global }
 *
 * Все вызовы t(), locale, setLocale останутся без изменений.
 */

import { ref, computed } from 'vue'
import ru from './ru.js'
import en from './en.js'

const MESSAGES = { ru, en }
const STORAGE_KEY = 'tt_locale'

// ── Реактивная локаль ────────────────────────────────────────────────────────
export const locale = ref(localStorage.getItem(STORAGE_KEY) || 'ru')

export function setLocale(lang) {
  if (!MESSAGES[lang]) return
  locale.value = lang
  localStorage.setItem(STORAGE_KEY, lang)
}

// ── Резолвер вложенных ключей: 'errors.saveCell' → messages.errors.saveCell ──
function resolve(messages, key) {
  const parts = key.split('.')
  let cur = messages
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}

// ── Интерполяция: 'Нет данных за {year}' + { year: 2025 } → 'Нет данных за 2025'
function interpolate(str, params) {
  if (!params || typeof str !== 'string') return str
  return str.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`)
}

// ── Основная функция перевода ────────────────────────────────────────────────
export function t(key, params) {
  const msgs = MESSAGES[locale.value] ?? MESSAGES['ru']
  const fallback = MESSAGES['ru']
  const val = resolve(msgs, key) ?? resolve(fallback, key)
  if (val === undefined) {
    console.warn(`[i18n] Missing key: "${key}" for locale "${locale.value}"`)
    return key
  }
  if (typeof val === 'string') return interpolate(val, params)
  return val // массивы (months.short) возвращаем как есть
}

// ── Композабл useI18n() — тот же API что у Vue I18n ─────────────────────────
export function useI18n() {
  return { t, locale, setLocale }
}

// ── Плагин для app.use() ─────────────────────────────────────────────────────
export const i18n = {
  install(app) {
    // Глобальные свойства — $t доступен в шаблонах без импорта
    app.config.globalProperties.$t = t
    app.config.globalProperties.$locale = locale
    // Provide для возможного inject
    app.provide('i18n', { t, locale, setLocale })
  }
}
