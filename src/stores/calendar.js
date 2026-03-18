import { t } from '../i18n/index.js'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sb } from '../supabase'
import {
  toISODate, startOfWeek, addDays, isWeekendISO, entryKey,
  SLOT_START, SLOT_END_EXCL, firstFullWeekStartOfMonth
} from '../utils'
import { useAuthStore } from './auth'
import { useProjectsStore } from './projects'
import { useToastStore } from './toast'

const WEEK_STORAGE_KEY = 'timeTrackerCurrentWeekStart'

function loadWeekFromStorage() {
  try {
    const raw = localStorage.getItem(WEEK_STORAGE_KEY)
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return startOfWeek(new Date())
    return startOfWeek(new Date(raw + 'T00:00:00'))
  } catch {
    return startOfWeek(new Date())
  }
}

export const useCalendarStore = defineStore('calendar', () => {
  const auth = useAuthStore()
  const proj = useProjectsStore()
  const toast = useToastStore()

  const currentWeekStart = ref(loadWeekFromStorage())
  const entries = ref({})        // key "date|slot" -> [pid1, pid2?]
  const cellHalf = ref({})       // key "date|slot" -> bool
  const dayOverrides = ref({})   // dateISO -> bool
  const savingCells = new Set() // ключи date|slot которые сейчас сохраняются

  // Кэш загруженных дат с ограничением размера.
  // Хранит не более MAX_CACHED_DATES дат; при переполнении вытесняет самые старые
  // (порядок вставки в Map === порядок итерации → первый = самый старый).
  const MAX_CACHED_DATES = 60 // ~8–9 недель
  const loadedDatesMap = new Map() // dateISO -> true, insertion-ordered

  function _markDateLoaded(dateISO) {
    if (loadedDatesMap.has(dateISO)) return // уже есть — порядок не меняем
    // Вытесняем самую старую дату если достигли лимита
    if (loadedDatesMap.size >= MAX_CACHED_DATES) {
      const oldest = loadedDatesMap.keys().next().value
      loadedDatesMap.delete(oldest)
      // Очищаем записи для вытесненной даты из entries и cellHalf
      for (const k of Object.keys(entries.value)) {
        if (k.startsWith(oldest + '|')) {
          delete entries.value[k]
          delete cellHalf.value[k]
        }
      }
      delete dayOverrides.value[oldest]
    }
    loadedDatesMap.set(dateISO, true)
  }

  function _hasDateLoaded(dateISO) {
    return loadedDatesMap.has(dateISO)
  }

  function _unmarkDateLoaded(dateISO) {
    loadedDatesMap.delete(dateISO)
  }

  const todayISO = computed(() => toISODate(new Date()))

  const columns = computed(() => {
    const cols = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(currentWeekStart.value, i)
      const iso = toISODate(d)
      cols.push({ index: i, date: d, iso, isToday: iso === todayISO.value })
    }
    return cols
  })

  const slots = computed(() => {
    const s = []
    for (let i = SLOT_START; i < SLOT_END_EXCL; i++) s.push(i)
    return s
  })

  function isPremiumWholeDay(dateISO) {
    const ov = dayOverrides.value[dateISO]
    if (ov === true) return true
    if (ov === false) return false
    return isWeekendISO(dateISO)
  }

  // Чистая функция — не зависит от реактивного состояния.
  // Используется и в slotMultiplier (текущая неделя), и в calcAllHours (все данные).
  function calcMultiplier(dateISO, slot, ovMap) {
    const ov = ovMap[dateISO]
    const isWeekend = (() => { const d = new Date(dateISO + 'T00:00:00').getDay(); return d === 0 || d === 6 })()
    if (ov === true || (ov === undefined && isWeekend)) return 1.5
    if (ov === false) return 1.0
    const hour = ((slot * 30) % 1440) / 60
    return hour < 10 || hour >= 19 ? 1.5 : 1.0
  }

  function slotMultiplier(dateISO, slot) {
    return calcMultiplier(dateISO, slot, dayOverrides.value)
  }

  function getOverride(dateISO) {
    const v = dayOverrides.value[dateISO]
    return v === undefined ? null : v
  }

  function getCell(dateISO, slot) {
    return entries.value[entryKey(dateISO, slot)] ?? []
  }

  function isHalfCell(dateISO, slot) {
    const k = entryKey(dateISO, slot)
    return !!cellHalf.value[k] && (getCell(dateISO, slot).length === 1)
  }

  function saveWeek() {
    try { localStorage.setItem(WEEK_STORAGE_KEY, toISODate(currentWeekStart.value)) } catch {}
  }

  async function loadWeek() {
    saveWeek()
    if (!auth.userId) return
    const dates = columns.value.map(c => c.iso)
    await Promise.all([
      fetchEntriesForDates(dates),
      fetchDayOverridesForDates(dates)
    ])
  }

  async function fetchEntriesForDates(dateList) {
    const dates = dateList.filter(d => !_hasDateLoaded(d))
    if (!dates.length) return
    dates.forEach(d => _markDateLoaded(d))

    const { data, error } = await sb
      .from('calendar_entries')
      .select('date,slot,task_index,project_id,is_half')
      .eq('user_id', auth.userId)
      .in('date', dates)

    if (error) {
      dates.forEach(d => _unmarkDateLoaded(d))
      throw error
    }

    for (const row of (data || [])) {
      const k = entryKey(row.date, row.slot)
      if (!entries.value[k]) entries.value[k] = []
      const idx = row.task_index === 2 ? 1 : 0
      entries.value[k][idx] = row.project_id
      if (row.task_index === 1) cellHalf.value[k] = !!row.is_half
    }
  }

  async function fetchDayOverridesForDates(dateList) {
    if (!dateList.length) return
    const { data, error } = await sb
      .from('day_overrides')
      .select('date,is_premium')
      .eq('user_id', auth.userId)
      .in('date', dateList)
    if (error) throw error

    for (const d of dateList) delete dayOverrides.value[d]
    for (const row of (data || [])) dayOverrides.value[row.date] = !!row.is_premium
  }

  // Считает { real, weighted } для одной ячейки.
  // taskCount — количество задач (1 или 2), halfCell — флаг половинки.
  function calcCellHours(dateISO, slot, taskCount, halfCell) {
    const realPer     = taskCount === 2 ? 0.25 : (halfCell ? 0.25 : 0.5)
    const mult        = calcMultiplier(dateISO, slot, dayOverrides.value)
    const weightedPer = realPer * mult
    return { real: realPer * taskCount, weighted: weightedPer * taskCount }
  }

  async function saveCell(dateISO, slot, taskIds, isHalf = false) {
    const k = entryKey(dateISO, slot)

    // Защита от параллельных вызовов на одну ячейку (двойной клик)
    if (savingCells.has(k)) return
    savingCells.add(k)

    // Запоминаем старое состояние для возможного отката
    const prevTaskIds = entries.value[k] ? [...entries.value[k]] : []
    const prevIsHalf  = !!cellHalf.value[k] && prevTaskIds.length === 1

    let clean = (Array.isArray(taskIds) ? taskIds : [])
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 2)

    if (isHalf && clean.length > 1) clean = clean.slice(0, 1)

    // ── Оптимистичное обновление локального state — сразу, до запроса к БД ──
    if (clean.length === 0) {
      delete entries.value[k]
      delete cellHalf.value[k]
    } else {
      entries.value[k] = clean
      cellHalf.value[k] = isHalf && clean.length === 1
    }
    applyUsageDelta(prevTaskIds, clean, dateISO)

    // ── Фоновое сохранение в БД ───────────────────────────────────────────────
    ;(async () => {
      try {
        if (clean.length > 0) {
          const rows = clean.map((pid, i) => ({
            user_id: auth.userId,
            date: dateISO,
            slot,
            task_index: i + 1,
            project_id: pid,
            is_half: i === 0 ? isHalf : false
          }))

          // Вариант Б: upsert и delete (если нужен) запускаем параллельно
          const ops = [
            sb.from('calendar_entries')
              .upsert(rows, { onConflict: 'user_id,date,slot,task_index' })
          ]
          if (clean.length < 2) {
            ops.push(
              sb.from('calendar_entries')
                .delete()
                .eq('user_id', auth.userId)
                .eq('date', dateISO)
                .eq('slot', slot)
                .eq('task_index', 2)
            )
          }
          const results = await Promise.all(ops)
          const err = results.find(r => r.error)?.error
          if (err) throw err
        } else {
          const { error: delErr } = await sb
            .from('calendar_entries')
            .delete()
            .eq('user_id', auth.userId)
            .eq('date', dateISO)
            .eq('slot', slot)
          if (delErr) throw delErr
        }

        // Обновляем агрегаты часов (fire-and-forget)
        const newIsHalf = isHalf && clean.length === 1
        const allPids = new Set([...prevTaskIds, ...clean])
        for (const pid of allPids) {
          const wasBefore = prevTaskIds.includes(pid)
          const isAfter   = clean.includes(pid)
          let delta = { real: 0, weighted: 0 }
          if (wasBefore) {
            const h = calcCellHours(dateISO, slot, prevTaskIds.length, prevIsHalf)
            delta.real     -= h.real     / prevTaskIds.length
            delta.weighted -= h.weighted / prevTaskIds.length
          }
          if (isAfter) {
            const h = calcCellHours(dateISO, slot, clean.length, newIsHalf)
            delta.real     += h.real     / clean.length
            delta.weighted += h.weighted / clean.length
          }
          if (delta.real !== 0 || delta.weighted !== 0) {
            proj.applyHoursDelta(pid, delta).catch(console.error)
          }
        }
      } catch (e) {
        // Откат локального state при ошибке сети
        console.error('saveCell background error:', e)
        if (prevTaskIds.length === 0) {
          // Ячейка была пустой — удаляем то, что успели добавить оптимистично
          delete entries.value[k]
          delete cellHalf.value[k]
        } else if (clean.length === 0) {
          // Ячейка была заполнена, мы её очистили — восстанавливаем
          entries.value[k] = prevTaskIds
          cellHalf.value[k] = prevIsHalf
        } else {
          // Ячейка была заполнена, мы изменили содержимое — восстанавливаем предыдущее
          entries.value[k] = prevTaskIds
          cellHalf.value[k] = prevIsHalf
        }
        applyUsageDelta(clean, prevTaskIds, dateISO)

        toast.error(t('errors.saveCell'))
      } finally {
        savingCells.delete(k)
      }
    })()
  }

  async function upsertDayOverride(dateISO, isPremium) {
    const payload = { user_id: auth.userId, date: dateISO, is_premium: !!isPremium }
    const { error } = await sb.from('day_overrides').upsert(payload, { onConflict: 'user_id,date' })
    if (error) throw error
    dayOverrides.value[dateISO] = !!isPremium
  }

  async function deleteDayOverride(dateISO) {
    const { error } = await sb.from('day_overrides').delete().eq('user_id', auth.userId).eq('date', dateISO)
    if (error) throw error
    delete dayOverrides.value[dateISO]
  }

  function prevWeek() {
    currentWeekStart.value = addDays(currentWeekStart.value, -7)
  }

  function nextWeek() {
    currentWeekStart.value = addDays(currentWeekStart.value, 7)
  }

  function goToday() {
    currentWeekStart.value = startOfWeek(new Date())
  }

  function jumpToMonth(year, month) {
    currentWeekStart.value = firstFullWeekStartOfMonth(year, month)
  }

// --- Полный подсчёт часов из БД ---
const allHoursMap = ref(new Map())
const allHoursLoading = ref(false)
const allEntriesCache = ref([])   // сырые строки calendar_entries — для StatsTab
const allOverridesCache = ref({}) // dateISO -> bool — для StatsTab

// BroadcastChannel для координации между вкладками: предотвращает параллельный
// запуск calcAllHours в двух вкладках одновременно (иначе двойной инкремент в БД).
let _calcChannel = null
function _getCalcChannel() {
  if (!_calcChannel && typeof BroadcastChannel !== 'undefined') {
    _calcChannel = new BroadcastChannel('timetracker_calc_lock')
  }
  return _calcChannel
}
// true пока другая вкладка держит лок
let _remoteCalcRunning = false
function _initCalcChannel() {
  const ch = _getCalcChannel()
  if (!ch) return
  ch.onmessage = (e) => {
    if (e.data === 'calc_start') _remoteCalcRunning = true
    if (e.data === 'calc_done')  _remoteCalcRunning = false
  }
}

// --- Статистика использования проектов (для быстрого доступа в CellModal) ---
// { [pid]: { count: number, lastDate: string } }
const usageStats = ref({})

// Инициализируем межвкладочный канал сразу при создании стора
_initCalcChannel()

async function loadUsageStats() {
  if (!auth.userId) return
  // Агрегирующий запрос — возвращает одну строку на проект вместо всех записей
  const { data, error } = await sb
    .from('calendar_entries')
    .select('project_id.count(), date.max()')
    .eq('user_id', auth.userId)
    .not('project_id', 'is', null)
  if (error) {
    // Фоллбэк: агрегация не поддерживается — берём только последние 500 записей.
    // Этого достаточно для определения "последних" и "популярных" проектов в CellModal,
    // при этом не грузим всю историю пользователя в память браузера.
    const { data: raw, error: rawErr } = await sb
      .from('calendar_entries')
      .select('project_id, date')
      .eq('user_id', auth.userId)
      .not('project_id', 'is', null)
      .order('date', { ascending: false })
      .limit(500)
    if (rawErr) { console.error('loadUsageStats:', rawErr); return }
    const stats = {}
    for (const row of (raw || [])) {
      const pid = row.project_id
      if (!pid) continue
      if (!stats[pid]) stats[pid] = { count: 0, lastDate: '' }
      stats[pid].count++
      if (row.date > stats[pid].lastDate) stats[pid].lastDate = row.date
    }
    usageStats.value = stats
    return
  }
  const stats = {}
  for (const row of (data || [])) {
    const pid = row.project_id
    if (!pid) continue
    stats[pid] = {
      count:    Number(row.count) || 0,
      lastDate: row.max           || '',
    }
  }
  usageStats.value = stats
}

// Обновляем usageStats локально при saveCell — без лишнего запроса к БД
function applyUsageDelta(prevPids, nextPids, dateISO) {
  const stats = { ...usageStats.value }
  for (const pid of prevPids) {
    if (!nextPids.includes(pid) && stats[pid]) {
      stats[pid] = { ...stats[pid], count: Math.max(0, stats[pid].count - 1) }
    }
  }
  for (const pid of nextPids) {
    if (!prevPids.includes(pid)) {
      if (!stats[pid]) stats[pid] = { count: 0, lastDate: '' }
      stats[pid] = {
        count: stats[pid].count + 1,
        lastDate: dateISO > stats[pid].lastDate ? dateISO : stats[pid].lastDate
      }
    }
  }
  usageStats.value = stats
}

async function calcAllHours() {
  if (!auth.userId) return
  // Блокировка внутри вкладки
  if (allHoursLoading.value) return
  // Блокировка между вкладками: не запускаем если другая вкладка уже считает
  if (_remoteCalcRunning) {
    toast.error(t('errors.recalcRunning'))
    return
  }

  allHoursLoading.value = true
  const ch = _getCalcChannel()
  ch?.postMessage('calc_start') // уведомляем другие вкладки

  try {
    // Загружаем все записи юзера
    let entData = []
    let from = 0
    const PAGE = 1000
    while (true) {
      const { data, error: entErr } = await sb
        .from('calendar_entries')
        .select('date,slot,task_index,project_id,is_half')
        .eq('user_id', auth.userId)
        .range(from, from + PAGE - 1)
      if (entErr) throw entErr
      if (!data || data.length === 0) break
      entData = entData.concat(data)
      if (data.length < PAGE) break
      from += PAGE
    }

    // Загружаем все overrides юзера
    const { data: ovData, error: ovErr } = await sb
      .from('day_overrides')
      .select('date,is_premium')
      .eq('user_id', auth.userId)
    if (ovErr) throw ovErr

    // Строим карту overrides
    const ovMap = {}
    for (const row of (ovData || [])) ovMap[row.date] = !!row.is_premium

    // Группируем записи по ключу date|slot
    const cellMap = {}
    const halfMap = {}
    for (const row of (entData || [])) {
      const k = `${row.date}|${row.slot}`
      if (!cellMap[k]) cellMap[k] = []
      const idx = row.task_index === 2 ? 1 : 0
      cellMap[k][idx] = row.project_id
      if (row.task_index === 1) halfMap[k] = !!row.is_half
    }

    // Считаем часы
    const acc = new Map()
    for (const k in cellMap) {
      const taskIds = cellMap[k]
      if (!Array.isArray(taskIds) || taskIds.length === 0) continue
      const [dateISO, slotStr] = k.split('|')
      const slot = Number(slotStr)

      const mult = calcMultiplier(dateISO, slot, ovMap)

      const n = Math.min(2, taskIds.length)
      const isHalf = !!halfMap[k] && n === 1
      const realPer = n === 2 ? 0.25 : (isHalf ? 0.25 : 0.5)
      const weightedPer = realPer * mult

      for (let i = 0; i < n; i++) {
        const pid = taskIds[i]
        if (!pid) continue
        const cur = acc.get(pid) || { real: 0, weighted: 0 }
        cur.real += realPer
        cur.weighted += weightedPer
        acc.set(pid, cur)
      }
    }

    allHoursMap.value = acc
    allEntriesCache.value = entData
    allOverridesCache.value = ovMap
  } catch (e) {
    console.error('calcAllHours error:', e)
    toast.error(t('errors.recalcFailed'))
  } finally {
    allHoursLoading.value = false
    ch?.postMessage('calc_done') // снимаем лок для других вкладок
  }
}

  function reset() {
    savingCells.clear()
    loadedDatesMap.clear()
    usageStats.value = {}
    entries.value = {}
    cellHalf.value = {}
    dayOverrides.value = {}
    allHoursMap.value = new Map()
    allEntriesCache.value = []
    allOverridesCache.value = {}
  }

  return {
    allHoursMap, allHoursLoading, calcAllHours,
    allEntriesCache, allOverridesCache,
    usageStats, loadUsageStats,
    currentWeekStart, entries, cellHalf, dayOverrides,
    columns, slots, todayISO,
    isPremiumWholeDay, slotMultiplier, getOverride,
    getCell, isHalfCell, loadWeek, saveCell,
    upsertDayOverride, deleteDayOverride,
    prevWeek, nextWeek, goToday, jumpToMonth, reset,
  }
})
