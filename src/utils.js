export function pad2(n) {
  return String(n).padStart(2, '0')
}

export function toISODate(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`
}

export function fromISODate(s) {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setHours(0, 0, 0, 0)
  return dt
}

export function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function startOfWeek(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

export function fmtDayHeader(d, locale = 'ru') {
  const opts = { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }
  const lcMap = { ru: 'ru-RU', en: 'en-GB' }
  return d.toLocaleDateString(lcMap[locale] || locale, opts).replace(',', '')
}

export function slotToLabel(slotIndex) {
  const mins = slotIndex * 30
  const dayPlus = Math.floor(mins / 1440)
  const minsInDay = mins % 1440
  const h = Math.floor(minsInDay / 60)
  const m = minsInDay % 60
  const base = `${pad2(h)}:${pad2(m)}`
  return dayPlus === 0 ? base : `${base} (+1)`
}

export function isWeekendISO(dateISO) {
  const day = fromISODate(dateISO).getDay()
  return day === 0 || day === 6
}

export function entryKey(dateISO, slot) {
  return `${dateISO}|${slot}`
}

// ── Project colour palette ────────────────────────────────────────────────────
// To change colours: edit only the hex values here. Keys never change.
export const PROJECT_PALETTE = {
  'oat':     '#EBDCC7',
  'cream':   '#EBDEA6',
  'sage':    '#BBC5AB',
  'peach':   '#F09E7D',
  'honey':   '#F8991D',
  'spicy':   '#FC4024',
  'femme':   '#EF4782',
  'dessert': '#8552A0',
  'butch':   '#9F8D32',
  'basil':   '#00784F',
  'proud':   '#00859C',
  'pine':    '#004242',
}

// Ordered list of keys for ColorPicker
export const PALETTE_KEYS = Object.keys(PROJECT_PALETTE)

// Lookup helpers
export function colorKeyToHex(key) {
  return PROJECT_PALETTE[key] ?? PROJECT_PALETTE['gray']
}

export function hexToColorKey(hex) {
  if (!hex) return null
  const norm = hex.trim().toUpperCase()
  const entry = Object.entries(PROJECT_PALETTE).find(
    ([, v]) => v.toUpperCase() === norm
  )
  return entry ? entry[0] : null
}

// Legacy: kept for backward-compat during read from DB (color_hex column)
export function normalizeHexColor(v) {
  if (!v) return null
  let s = String(v).trim().toUpperCase()
  if (!s.startsWith('#')) s = '#' + s
  if (!/^#[0-9A-F]{6}$/.test(s)) return null
  return s
}

export function randomProjectColor() {
  return PALETTE_KEYS[Math.floor(Math.random() * PALETTE_KEYS.length)]
}

// Kept for compatibility — still used for projects without any colour stored
export const ALLOWED_PROJECT_COLORS = PALETTE_KEYS

export function stableColorFromString(str) {
  const palette = ['#6aa6ff','#66ffa6','#ffb86a','#ff6ad5','#a66aff','#6afff0','#ffd36a','#ff6a6a']
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

export function firstFullWeekStartOfMonth(year, monthIndex) {
  const firstDay = new Date(year, monthIndex, 1)
  let weekStart = startOfWeek(firstDay)
  if (weekStart.getMonth() !== monthIndex || weekStart.getFullYear() !== year) {
    weekStart = addDays(weekStart, 7)
  }
  return weekStart
}

export const MONTH_NAMES_RU = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
]

export const SLOT_START = 18   // 09:00
export const SLOT_END_EXCL = 54 // 03:00+1
