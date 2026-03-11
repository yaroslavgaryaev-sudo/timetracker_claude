import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sb } from '../supabase'
import {
  toISODate, startOfWeek, addDays, isWeekendISO, entryKey,
  SLOT_START, SLOT_END_EXCL, firstFullWeekStartOfMonth
} from '../utils'
import { useAuthStore } from './auth'

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

  const currentWeekStart = ref(loadWeekFromStorage())
  const entries = ref({})        // key "date|slot" -> [pid1, pid2?]
  const cellHalf = ref({})       // key "date|slot" -> bool
  const dayOverrides = ref({})   // dateISO -> bool
  const loadedDates = ref(new Set())

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

  function slotMultiplier(dateISO, slot) {
    if (isPremiumWholeDay(dateISO)) return 1.5
    const mins = (slot * 30) % 1440
    const hour = mins / 60
    return hour < 10 || hour >= 19 ? 1.5 : 1.0
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
    const dates = dateList.filter(d => !loadedDates.value.has(d))
    if (!dates.length) return
    dates.forEach(d => loadedDates.value.add(d))

    const { data, error } = await sb
      .from('calendar_entries')
      .select('date,slot,task_index,project_id,is_half')
      .in('date', dates)

    if (error) {
      dates.forEach(d => loadedDates.value.delete(d))
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
      .in('date', dateList)
    if (error) throw error

    for (const d of dateList) delete dayOverrides.value[d]
    for (const row of (data || [])) dayOverrides.value[row.date] = !!row.is_premium
  }

  async function saveCell(dateISO, slot, taskIds, isHalf = false) {
    let clean = (Array.isArray(taskIds) ? taskIds : [])
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 2)

    if (isHalf && clean.length > 1) clean = clean.slice(0, 1)

    const { error: delErr } = await sb
      .from('calendar_entries')
      .delete()
      .eq('date', dateISO)
      .eq('slot', slot)
    if (delErr) throw delErr

    if (clean.length > 0) {
      const rows = clean.map((pid, i) => ({
        user_id: auth.userId,
        date: dateISO,
        slot,
        task_index: i + 1,
        project_id: pid,
        is_half: i === 0 ? isHalf : false
      }))
      const { error: insErr } = await sb.from('calendar_entries').insert(rows)
      if (insErr) throw insErr
    }

    const k = entryKey(dateISO, slot)
    if (clean.length === 0) {
      delete entries.value[k]
      delete cellHalf.value[k]
    } else {
      entries.value[k] = clean
      cellHalf.value[k] = isHalf && clean.length === 1
    }
  }

  async function upsertDayOverride(dateISO, isPremium) {
    const payload = { user_id: auth.userId, date: dateISO, is_premium: !!isPremium }
    const { error } = await sb.from('day_overrides').upsert(payload, { onConflict: 'user_id,date' })
    if (error) throw error
    dayOverrides.value[dateISO] = !!isPremium
  }

  async function deleteDayOverride(dateISO) {
    const { error } = await sb.from('day_overrides').delete().eq('date', dateISO)
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

  function reset() {
    entries.value = {}
    cellHalf.value = {}
    dayOverrides.value = {}
    loadedDates.value.clear()
  }

  // Подсчёт часов по проектам (используется в Projects таблице)
  function calcHoursByProject() {
    const acc = new Map()
    for (const k in entries.value) {
      const taskIds = entries.value[k]
      if (!Array.isArray(taskIds) || taskIds.length === 0) continue
      const [dateISO, slotStr] = k.split('|')
      const slot = Number(slotStr)
      const mult = slotMultiplier(dateISO, slot)
      const n = Math.min(2, taskIds.length)
      const realPer = n === 2 ? 0.25 : (cellHalf.value[k] ? 0.25 : 0.5)
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
    return acc
  }

  return {
    currentWeekStart, entries, cellHalf, dayOverrides,
    columns, slots, todayISO,
    isPremiumWholeDay, slotMultiplier, getOverride,
    getCell, isHalfCell, loadWeek, saveCell,
    upsertDayOverride, deleteDayOverride,
    prevWeek, nextWeek, goToday, jumpToMonth, reset,
    calcHoursByProject
  }
})
