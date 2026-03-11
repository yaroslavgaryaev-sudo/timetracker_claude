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

export function fmtDayHeader(d) {
  const opts = { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }
  return d.toLocaleDateString('ru-RU', opts).replace(',', '')
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

export const ALLOWED_PROJECT_COLORS = [
  '#FF0000', '#FF9300', '#FFFF00', '#00FF00', '#00AB49',
  '#FFFFFF', '#FF00FF', '#A800FF', '#3388EF', '#00FFFF',
  '#00C1C8', '#666666'
]

export function normalizeHexColor(v) {
  if (!v) return null
  let s = String(v).trim().toUpperCase()
  if (!s.startsWith('#')) s = '#' + s
  if (!/^#[0-9A-F]{6}$/.test(s)) return null
  return s
}

export function randomProjectColor() {
  return ALLOWED_PROJECT_COLORS[Math.floor(Math.random() * ALLOWED_PROJECT_COLORS.length)]
}

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
