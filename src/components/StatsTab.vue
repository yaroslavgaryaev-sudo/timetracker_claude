<script setup>
import { useI18n } from '../i18n/index.js'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useCalendarStore } from '../stores/calendar'
import { useProjectsStore } from '../stores/projects'
import { useAuthStore } from '../stores/auth'
import { sb } from '../supabase'

const cal = useCalendarStore()
const proj = useProjectsStore()
const auth = useAuthStore()
const { t } = useI18n()

const selectedYear = ref(new Date().getFullYear())
const yearCache = ref({})   // { 2024: { months: [...] }, 2025: ... }
const loadingYears = new Set() // защита от параллельных запросов одного года
const loading = ref(false)
const statsError = ref('')
const yearMenuOpen = ref(false)

function selectYear(y) { selectedYear.value = y; yearMenuOpen.value = false }

// Закрываем меню при клике вне
function onDocClick(e) {
  if (!e.target.closest('.mob-year-wrap')) yearMenuOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

const MONTHS_RU = computed(() => t('months.upper'))

// Список доступных годов — определяем один раз при логине
const availableYears = ref([])

async function loadAvailableYears() {
  if (!auth.userId) return
  const { data, error } = await sb
    .from('calendar_entries')
    .select('date')
    .eq('user_id', auth.userId)
    .order('date', { ascending: true })
    .limit(1)
  const { data: data2 } = await sb
    .from('calendar_entries')
    .select('date')
    .eq('user_id', auth.userId)
    .order('date', { ascending: false })
    .limit(1)
  if (error || !data?.length) return
  const minYear = new Date(data[0].date).getFullYear()
  const maxYear = data2?.length ? new Date(data2[0].date).getFullYear() : minYear
  const years = []
  for (let y = maxYear; y >= minYear; y--) years.push(y)
  availableYears.value = years
  // Если текущий год отсутствует в данных — выбираем последний имеющийся
  if (!years.includes(selectedYear.value)) selectedYear.value = years[0]
}

async function loadYear(year) {
  if (!auth.userId || yearCache.value[year] || loadingYears.has(year)) return
  loadingYears.add(year)
  loading.value = true
  statsError.value = ''
  try {
    // Серверная агрегация — один RPC вместо загрузки тысяч строк
    const { data, error } = await sb.rpc('aggregate_hours_by_year_month', { p_year: year })
    if (error) throw error

    const monthAcc = {}
    for (const row of (data || [])) {
      const ym = row.year_month
      if (!monthAcc[ym]) monthAcc[ym] = []
      const p = proj.byId(row.project_id)
      monthAcc[ym].push({
        id: row.project_id,
        name: p ? p.name : `[${row.project_id.slice(0, 6)}]`,
        hours: row.weighted_hours || 0,
        isFree: !p || p.budget === 0,
      })
    }

    const months = []
    for (const ym of Object.keys(monthAcc).sort()) {
      months.push({ yearMonth: ym, projects: monthAcc[ym] })
    }

    yearCache.value = { ...yearCache.value, [year]: { months } }
  } catch (e) {
    statsError.value = t('stats.error')
    console.error('StatsTab loadYear error:', e)
  } finally {
    loadingYears.delete(year)
    loading.value = false
  }
}

// При смене года — подгружаем если ещё нет в кэше
watch(selectedYear, y => { if (y) loadYear(y) })

async function init() {
  if (!auth.isAuthed) return
  await loadAvailableYears()
  await loadYear(selectedYear.value)
}

onMounted(init)
watch(() => auth.isAuthed, v => {
  if (v) {
    init()
  } else {
    // Сброс при logout
    yearCache.value = {}
    availableYears.value = []
    selectedYear.value = new Date().getFullYear()
    loadingYears.clear()
  }
})

async function reload() {
  if (!selectedYear.value) return
  // Сбрасываем кэш текущего года и перезагружаем
  const y = selectedYear.value
  yearCache.value = { ...yearCache.value, [y]: undefined }
  delete yearCache.value[y]
  await loadYear(y)
}

function hourPrice(pid) {
  const p = proj.byId(pid)
  if (!p || p.budget === 0) return 0
  if (!p.totalWeightedHours || p.totalWeightedHours === 0) return 0
  return p.budget / p.totalWeightedHours
}

const currentYearData = computed(() => yearCache.value[selectedYear.value] ?? null)

const displayEntries = computed(() => {
  if (!currentYearData.value) return []
  return [[String(selectedYear.value), currentYearData.value]]
})

function yearTotals(yearData) {
  let totalHours = 0, totalRevenue = 0
  for (const month of yearData.months) {
    for (const p of month.projects) {
      totalHours += p.hours
      if (!p.isFree) totalRevenue += p.hours * hourPrice(p.id)
    }
  }
  return { totalHours, totalRevenue, avgPrice: totalHours > 0 ? totalRevenue / totalHours : 0 }
}

function monthTotals(month) {
  let totalHours = 0, totalRevenue = 0
  for (const p of month.projects) {
    totalHours += p.hours
    if (!p.isFree) totalRevenue += p.hours * hourPrice(p.id)
  }
  return { totalHours, totalRevenue, avgPrice: totalHours > 0 ? totalRevenue / totalHours : 0 }
}

function sortedProjects(projects) {
  return [...projects.filter(p => !p.isFree), ...projects.filter(p => p.isFree)]
}

function fmtNum(v) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

function fmtHours(h) {
  if (h === 0) return '0'
  const r = Math.round(h * 100) / 100
  if (r % 1 === 0) return String(Math.round(r))
  return r.toFixed(2).replace('.', ',')
}
</script>

<template>
  <div class="stats-tab">
    <div class="stats-filterbar">
      <span class="sf-label">{{ t('stats.year') }}</span>

      <!-- Десктоп: кнопки-год -->
      <button
        v-for="y in availableYears" :key="y"
        class="tabbtn sf-btn desktop-year-btns"
        :class="{ active: selectedYear === y }"
        @click="selectedYear = y"
      >{{ y }}</button>

      <!-- Мобайл: выпадающий список годов -->
      <div class="mob-year-wrap">
        <button class="tabbtn mob-year-btn" @click.stop="yearMenuOpen = !yearMenuOpen">
          {{ selectedYear }} ▾
        </button>
        <div v-if="yearMenuOpen" class="mob-year-dropdown">
          <button
            v-for="y in availableYears" :key="y"
            class="mob-year-item"
            :class="{ active: selectedYear === y }"
            @click.stop="selectYear(y)"
          >{{ y }}</button>
        </div>
      </div>

      <button class="btn sf-reload" :disabled="loading" @click="reload">
        {{ loading ? '…' : t('btn.recalc') }}
      </button>
    </div>

    <div v-if="statsError" class="stats-error">{{ statsError }}</div>
    <div v-if="loading" class="stats-state">{{ t('state.loading') }}</div>

    <div v-else-if="!currentYearData" class="stats-state">
      {{ t('stats.noData', { year: selectedYear }) }}
    </div>

    <div v-else class="stats-content">
      <template v-for="[year, yearData] in displayEntries" :key="year">

        <div class="year-summary">
          <div class="year-row1">
            <span class="year-num">{{ year }}</span>
            <div class="year-stat year-stat-revenue">
              <div class="ys-label">{{ t('stats.revenue') }}</div>
              <div class="ys-value">{{ fmtNum(yearTotals(yearData).totalRevenue) }}</div>
            </div>
          </div>
          <div class="year-stats-grid">
            <div class="year-stat">
              <div class="ys-label">{{ t('stats.hours') }}</div>
              <div class="ys-value">{{ fmtHours(yearTotals(yearData).totalHours) }}</div>
            </div>
            <div class="year-stat">
              <div class="ys-label">{{ t('stats.pricePerH') }}</div>
              <div class="ys-value">{{ fmtNum(yearTotals(yearData).avgPrice) }}</div>
            </div>
          </div>
        </div>

        <div v-for="month in yearData.months" :key="month.yearMonth" class="month-block">

          <div class="month-header">
            <span class="month-name">{{ t('months.upper')[Number(month.yearMonth.split('-')[1]) - 1] }}</span>
            <div class="month-line"></div>
            <span class="month-count">{{ t('stats.projectsCount', { n: month.projects.length }) }}</span>
          </div>

          <div class="mcols mcols-header">
            <span class="col-hide-mobile"></span>
            <span>{{ t('stats.hours') }}</span>
            <span>{{ t('stats.pricePerH') }}</span>
            <span>{{ t('stats.revenue') }}</span>
          </div>

          <div
            v-for="p in sortedProjects(month.projects)"
            :key="p.id"
            class="mrow"
            :class="{ 'mrow-free': p.isFree }"
          >
            <div class="mrow-name-line"><span>{{ p.name }}</span></div>
            <div class="mcols mrow-data">
              <span class="col-hide-mobile"></span>
              <span class="mono">{{ fmtHours(p.hours) }}</span>
              <span class="mono">{{ p.isFree ? '—' : fmtNum(hourPrice(p.id)) }}</span>
              <span class="mono mono-rev">{{ p.isFree ? '—' : fmtNum(p.hours * hourPrice(p.id)) }}</span>
            </div>
          </div>

          <div class="mtotals-wrap">
            <div class="mtotals-title">{{ t('stats.total') }}</div>
            <div class="mcols mtotals-row">
              <span class="col-hide-mobile"></span>
              <span class="mono mono-bold">{{ fmtHours(monthTotals(month).totalHours) }}</span>
              <span class="mono mono-gold">{{ monthTotals(month).avgPrice > 0 ? fmtNum(monthTotals(month).avgPrice) : '—' }}</span>
              <span class="mono mono-gold mono-bold">{{ fmtNum(monthTotals(month).totalRevenue) }}</span>
            </div>
          </div>

        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.stats-tab { padding: 0; }

/* ── Filterbar ── */
.stats-filterbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
  flex-wrap: wrap;
}
.sf-label {
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--text-muted);
}
.sf-btn {
  font-size: 12px !important;
  padding: 6px 14px !important;
  font-family: ui-monospace, monospace;
}
.sf-reload {
  margin-left: auto;
  font-size: 13px;
  padding: 5px 12px;
  line-height: 1;
  white-space: nowrap;
}

/* Мобильный dropdown лет */
.mob-year-wrap { display: none; position: relative; }
.mob-year-btn { min-width: 90px; text-align: left; font-family: ui-monospace, monospace; }
.mob-year-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 300;
  background: var(--surface-modal);
  border: 1px solid var(--border-input);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  min-width: 100px;
}
.mob-year-item {
  display: block;
  width: 100%;
  padding: 10px 16px;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
  transition: background 0.1s;
}
.mob-year-item:last-child { border-bottom: none; }
.mob-year-item:hover { background: var(--surface-hover); color: #e8ecf7; }
.mob-year-item.active { color: var(--accent-text); background: var(--accent-faint); }

/* ── Error / state ── */
.stats-error {
  margin: 12px 14px 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(255, 80, 80, 0.07);
  border: 1px solid rgba(255, 80, 80, 0.2);
  font-size: 13px;
  color: rgba(255, 120, 120, 0.9);
}
.stats-state {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

/* ── Content ── */
.stats-content { padding: 18px 14px; }

/* ── Year summary ── */
.year-summary {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  margin-bottom: 24px;
  background: var(--accent-faint);
  overflow: hidden;
}
/* На десктопе year-row1 прозрачен — год и выручка просто идут в ряд */
.year-row1 {
  display: contents;
}
.year-num {
  font-family: ui-monospace, monospace;
  font-size: 26px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 3px;
  padding: 12px 18px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.year-stats-grid {
  flex: 1;
  display: flex;
  align-items: stretch;
  min-width: 0;
}
.year-stat {
  flex: 1;
  padding: 10px 16px;
  border-left: 1px solid var(--accent-dim);
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}
.ys-label {
  font-size: 9px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 4px;
  white-space: nowrap;
}
.ys-value {
  font-family: ui-monospace, monospace;
  font-size: 15px;
  font-weight: 700;
  color: var(--accent-text);
}

/* ── Month block ── */
.month-block {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 16px;
}
.month-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  background: var(--surface-raised);
  border-bottom: 1px solid var(--border);
}
.month-name {
  font-family: ui-monospace, monospace;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--accent-text);
}
.month-line {
  flex: 1;
  height: 1px;
  background: rgba(232,213,183,0.15);
}
.month-count {
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--text-muted);
}

/* Сетка: пустая колонка (для отступа) | часы | цена | выручка */
.mcols {
  display: grid;
  grid-template-columns: 2.5fr 70px 93px 100px;
  gap: 12px;
  padding: 8px 20px;
}
.mcols-header span {
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.26);
  font-family: ui-monospace, monospace;
}

/* ── Project row ── */
.mrow {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--surface-raised);
  transition: background 0.12s;
  cursor: default;
}
.mrow:hover { background: var(--surface); }

/* Строка с названием — на десктопе занимает оставшееся пространство слева */
.mrow-name-line {
  flex: 1;
  min-width: 0;
  padding: 9px 12px 9px 20px;
}
.mrow-name-line span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text);
}
.mrow-free .mrow-name-line span {
  color: var(--text-dim);
  font-style: italic;
}
.mrow-free .mono { color: var(--text-faint); }

/* Строка с цифрами — на десктопе прижата вправо */
.mrow-data {
  flex-shrink: 0;
  padding-top: 9px;
  padding-bottom: 9px;
  align-items: center;
}

/* ── Totals ── */
.mtotals-wrap {
  background: var(--accent-faint);
  border-top: 1px solid var(--accent-dim);
}
.mtotals-title {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--accent);
  padding: 8px 20px 2px;
}
.mtotals-row {
  padding-top: 2px;
  padding-bottom: 10px;
  align-items: center;
}

/* ── Mono ── */
.mono {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  color: var(--text-secondary);
}
.mono-rev { color: var(--accent-text); font-weight: 600; }
.mono-bold { font-weight: 700; }
.mono-gold { color: var(--accent); }

/* ── Mobile ── */
@media (max-width: 640px) {
  .desktop-year-btns { display: none; }
  .mob-year-wrap { display: block; }
  .sf-label { display: none; }

  /* Year summary: год + выручка на первой строке, часы + цена часа на второй */
  .year-summary {
    flex-direction: column;
  }
  /* Первая строка: год слева, выручка справа */
  .year-row1 {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--accent-dim);
  }
  .year-num {
    font-size: 20px;
    padding: 10px 14px;
    flex-shrink: 0;
  }
  .year-stat-revenue {
    flex: 1;
    padding: 8px 14px;
    border-left: 1px solid var(--accent-dim);
    border-top: none;
  }
  /* Вторая строка: часы и цена часа */
  .year-stats-grid {
    flex-direction: row;
  }
  .year-stat:not(.year-stat-revenue) {
    flex: 1 1 45%;
    padding: 8px 12px;
    border-left: none;
    border-top: none;
  }
  .year-stat:not(.year-stat-revenue):last-child {
    border-left: 1px solid var(--accent-dim);
  }

  /* Month columns: 3 реальные колонки без пустышки */
  .col-hide-mobile { display: none; }
  .mcols {
    grid-template-columns: 52px 1fr 1fr;
    gap: 8px;
    padding: 6px 12px;
  }
  .mcols-header {
    padding: 5px 12px 4px;
  }
  .mcols-header span {
    font-size: 9px;
    letter-spacing: 0.8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .month-header { padding: 10px 12px; }
  .month-name { font-size: 14px; letter-spacing: 2px; }

  /* На мобильном строка проекта — вертикально (имя сверху, цифры снизу) */
  .mrow {
    flex-direction: column;
    align-items: stretch;
  }
  .mrow-name-line {
    flex: none;
    padding: 9px 12px 4px;
  }
  .mrow-name-line span {
    font-size: 14px;
    font-weight: 600;
  }
  .mrow-data {
    flex-shrink: unset;
    padding: 4px 12px 8px;
  }
  .mrow-data .mono {
    font-size: 12px;
  }

  /* Итого — крупнее, отступ совпадает с паддингом грида */
  .mtotals-title {
    padding: 9px 12px 4px;
    font-size: 12px;
    letter-spacing: 1.2px;
  }
  .mtotals-row {
    padding: 4px 12px 10px;
  }
  .mtotals-row .mono {
    font-size: 12px;
  }
}
</style>
