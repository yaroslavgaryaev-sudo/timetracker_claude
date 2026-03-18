<script setup>
import { useI18n, locale } from '../i18n/index.js'
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useCalendarStore } from '../stores/calendar'
import { useAuthStore } from '../stores/auth'
import { slotToLabel, fmtDayHeader, stableColorFromString, colorKeyToHex } from '../utils'
import CellModal from './CellModal.vue'
import DayModal from './DayModal.vue'
import { useProjectsStore } from '../stores/projects'
import { useToastStore } from '../stores/toast'

const cal = useCalendarStore()
const auth = useAuthStore()
const projStore = useProjectsStore()
const toast = useToastStore()

const rightBody = ref(null)
const leftBody = ref(null)
const hScroll = ref(null)

const monthIdx = ref(cal.currentWeekStart.getMonth())
const yearVal = ref(cal.currentWeekStart.getFullYear())

function buildYearList(base) {
  const cur = new Date().getFullYear()
  const start = (base >= cur - 5 && base <= cur) ? cur - 5 : base - 5
  const end = (base >= cur - 5 && base <= cur) ? cur : base + 5
  const years = []
  for (let y = start; y <= end; y++) years.push(y)
  return years
}
const yearList = computed(() => buildYearList(yearVal.value))

watch(() => cal.currentWeekStart, (d) => {
  monthIdx.value = d.getMonth()
  yearVal.value = d.getFullYear()
  loadWeek()
})

async function loadWeek() {
  try {
    await cal.loadWeek()
  } catch (e) {
    console.error(e)
    toast.error(t('errors.loadWeek'))
  }
}
async function onMonthYearChange() { cal.jumpToMonth(yearVal.value, monthIdx.value) }
async function onPrev() { cal.prevWeek(); await loadWeek() }
async function onNext() { cal.nextWeek(); await loadWeek() }
async function onToday() {
  if (isMobile.value) { await mobileToday(); await loadWeek() }
  else { cal.goToday(); await loadWeek() }
}

function onRightBodyScroll() {
  if (leftBody.value) leftBody.value.scrollTop = rightBody.value.scrollTop
}
function forwardWheel(e) {
  if (Math.abs(e.deltaX) > 0) {
    hScroll.value.scrollLeft += e.deltaX
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) e.preventDefault()
  }
}

// Мобильный режим: один день
const isMobile = ref(window.innerWidth <= 640)
const mobileDayOffset = ref(0) // смещение от начала недели (0–6)
const mobileCol = computed(() => cal.columns[mobileDayOffset.value] ?? cal.columns[0])
const { t } = useI18n()

function onResize() { isMobile.value = window.innerWidth <= 640 }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

// Флаг, чтобы watch не сбрасывал offset, когда мы сами управляем переходом
let _skipOffsetReset = false

// При переходе на другую неделю сбрасываем на первый день (если не управляем вручную)
watch(() => cal.currentWeekStart, () => {
  if (_skipOffsetReset) { _skipOffsetReset = false; return }
  mobileDayOffset.value = 0
})

function mobilePrevDay() {
  if (mobileDayOffset.value > 0) { mobileDayOffset.value--; return }
  _skipOffsetReset = true
  cal.prevWeek()
  mobileDayOffset.value = 6
}
function mobileNextDay() {
  if (mobileDayOffset.value < 6) { mobileDayOffset.value++; return }
  _skipOffsetReset = true
  cal.nextWeek()
  mobileDayOffset.value = 0
}
async function mobileToday() {
  _skipOffsetReset = true
  cal.goToday()
  await nextTick()
  const todayIdx = cal.columns.findIndex(c => c.iso === cal.todayISO)
  mobileDayOffset.value = todayIdx >= 0 ? todayIdx : 0
}

const cellModal = ref(null)
function openCell(dateISO, slot) { cellModal.value?.open(dateISO, slot) }

const dayModal = ref(null)
function openDay(dateISO) { dayModal.value?.open(dateISO) }

function projectForPid(pid) { return projStore.byId(pid) ?? null }
function cellColor(pid) { const p = projectForPid(pid); if (!p) return stableColorFromString(pid); return colorKeyToHex(p.color) ?? stableColorFromString(pid) }

const DARK_TEXT_KEYS = new Set(['oat', 'cream', 'sage', 'peach', 'honey', 'butch'])
function cellTextColor(pid) {
  const p = projectForPid(pid)
  if (p && DARK_TEXT_KEYS.has(p.color)) return '#1E1E1E'
  return 'rgba(255,255,255,0.92)'
}
function cellName(pid) { const p = projectForPid(pid); return p ? p.name : '— (проект удалён)' }


onMounted(() => {
  // На мобильном при старте открываем сегодняшний день
  if (isMobile.value) {
    const todayIdx = cal.columns.findIndex(c => c.iso === cal.todayISO)
    if (todayIdx >= 0) mobileDayOffset.value = todayIdx
  }
  loadWeek()
})
</script>

<template>
  <div class="cg-root">
    <!-- Navigation bar -->
    <div class="cg-nav">
      <div class="cg-nav-left">
        <button class="cg-btn cg-btn-icon cg-desktop-only" title="Предыдущая неделя" @click="onPrev">←</button>
        <button class="cg-btn" @click="onToday">{{ t('btn.today') }}</button>
        <button class="cg-btn cg-btn-icon cg-desktop-only" title="Следующая неделя" @click="onNext">→</button>

        <div class="cg-divider cg-desktop-only"></div>

        <select v-model="monthIdx" class="cg-select" @change="onMonthYearChange">
          <option v-for="(name, i) in t('months.short')" :key="i" :value="i">{{ name }}</option>
        </select>
        <select v-model="yearVal" class="cg-select cg-select-year mono" @change="onMonthYearChange">
          <option v-for="y in yearList" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>
      <div class="cg-nav-right">
        <span class="cg-hint-chip"><kbd>Клик</kbd> по дате: Рабочий ↔ Выходной</span>
      </div>
    </div>

    <!-- Grid — десктоп: вся неделя; мобайл: один день -->
    <div class="gridWrap">

      <!-- Мобильная навигация по дням -->
      <div v-if="isMobile" class="mob-day-nav">
        <button class="cg-btn cg-btn-icon" @click="mobilePrevDay">←</button>
        <div
          class="mob-day-title"
          :class="{
            'mob-day-today': mobileCol.isToday,
            'mob-day-off': cal.getOverride(mobileCol.iso) === true,
            'mob-day-work': cal.getOverride(mobileCol.iso) === false
          }"
          @click="openDay(mobileCol.iso)"
        >{{ fmtDayHeader(mobileCol.date, locale) }}</div>
        <button class="cg-btn cg-btn-icon" @click="mobileNextDay">→</button>
      </div>

      <div class="gridShell">
        <div class="leftCol">
          <div class="leftHeader" :class="{ 'leftHeader-hidden': isMobile }">{{ t('calendar.timeCol') }}</div>
          <div ref="leftBody" class="leftBody" @wheel="forwardWheel">
            <div v-for="slot in cal.slots" :key="slot" class="tcell mono">{{ slotToLabel(slot) }}</div>
          </div>
        </div>

        <div class="rightCol">
          <div ref="hScroll" class="hScroll">

            <!-- Заголовки дней — только на десктопе -->
            <div
              v-if="!isMobile"
              class="rightHeader"
              :style="{ gridTemplateColumns: `repeat(${cal.columns.length}, minmax(0, 1fr))` }"
            >
              <div
                v-for="col in cal.columns"
                :key="col.iso"
                class="hcell"
                :class="{
                  today: col.isToday,
                  userOff: cal.getOverride(col.iso) === true,
                  userWork: cal.getOverride(col.iso) === false
                }"
                style="cursor:pointer"
                title="Клик: сделать день рабочим/выходным"
                @click="openDay(col.iso)"
              >{{ fmtDayHeader(col.date, locale) }}</div>
            </div>

            <!-- Ячейки -->
            <div
              ref="rightBody"
              class="rightBody"
              @wheel="forwardWheel"
            >
              <div
                v-for="slot in cal.slots"
                :key="slot"
                class="gRow"
                :style="{ gridTemplateColumns: isMobile ? '1fr' : `repeat(${cal.columns.length}, minmax(0, 1fr))` }"
              >
                <!-- Десктоп: все 7 дней -->
                <template v-if="!isMobile">
                  <div
                    v-for="col in cal.columns"
                    :key="col.iso"
                    class="cell"
                    :class="cal.slotMultiplier(col.iso, slot) === 1.0 ? 'normal' : 'premium'"
                    @click="openCell(col.iso, slot)"
                  >
                    <div v-if="cal.getCell(col.iso, slot).length > 0" class="cellPills">
                      <div
                        v-for="pid in cal.getCell(col.iso, slot)"
                        :key="pid"
                        class="pill small"
                        :class="{ half: cal.isHalfCell(col.iso, slot) && cal.getCell(col.iso, slot).length === 1 }"
                        :style="{ background: cellColor(pid), color: cellTextColor(pid) }"
                      >
                        <span class="pname">{{ cellName(pid) }}</span>
                      </div>
                    </div>
                  </div>
                </template>

                <!-- Мобайл: только один день -->
                <template v-else>
                  <div
                    class="cell"
                    :class="cal.slotMultiplier(mobileCol.iso, slot) === 1.0 ? 'normal' : 'premium'"
                    @click="openCell(mobileCol.iso, slot)"
                  >
                    <div v-if="cal.getCell(mobileCol.iso, slot).length > 0" class="cellPills">
                      <div
                        v-for="pid in cal.getCell(mobileCol.iso, slot)"
                        :key="pid"
                        class="pill small"
                        :class="{ half: cal.isHalfCell(mobileCol.iso, slot) && cal.getCell(mobileCol.iso, slot).length === 1 }"
                        :style="{ background: cellColor(pid), color: cellTextColor(pid) }"
                      >
                        <span class="pname">{{ cellName(pid) }}</span>
                      </div>
                    </div>
                  </div>
                </template>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <CellModal ref="cellModal" />
    <DayModal ref="dayModal" />
  </div>
</template>

<style scoped>
.cg-root { padding: 0; }

/* Nav bar */
.cg-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  flex-wrap: wrap;
}
.cg-nav-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cg-nav-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.cg-btn {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
  padding: 6px 12px;
  border-radius: 9px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.cg-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
  border-color: var(--border-strong);
}
.cg-btn-icon { padding: 6px 10px; font-size: 15px; }

.cg-divider {
  width: 1px;
  height: 18px;
  background: var(--border);
  flex-shrink: 0;
}

.cg-select {
  background: var(--surface-raised);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 10px;
  border-radius: 9px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: var(--select-arrow);
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 28px;
}
.cg-select-year { min-width: 80px; }

.cg-hint-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-muted);
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-raised);
}
.cg-hint-chip kbd {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  color: var(--accent-muted);
  background: var(--accent-faint);
  border: 1px solid var(--accent-dim);
  border-radius: 5px;
  padding: 1px 5px;
}

/* Grid - use global styles */
.gridWrap { margin: 14px 14px 10px; }

.mob-day-nav {
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  gap: 8px;
}
.mob-day-title {
  flex: 1;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-text);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.12s;
}
.mob-day-title:hover { background: var(--surface-hover); }
.mob-day-today { color: var(--accent); }
.mob-day-off { color: var(--text-dim); }

/* Мобайл: скрываем подсказки, показываем навигацию по дням */
@media (max-width: 640px) {
  .mob-day-nav { display: flex; }
  .cg-nav-right { display: none; }
  .cg-desktop-only { display: none !important; }
  .cg-nav { padding: 8px 10px; }
  .cg-btn { padding: 5px 9px; font-size: 12px; }
  .cg-select { font-size: 12px; padding: 5px 8px; }
  .cg-select:not(.cg-select-year) { min-width: 135px; }
  .gridWrap { margin: 8px 8px 6px; }
  .leftHeader-hidden { display: none; }
}
</style>
