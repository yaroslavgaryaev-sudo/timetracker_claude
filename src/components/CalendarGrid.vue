<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useCalendarStore } from '../stores/calendar'
import { useAuthStore } from '../stores/auth'
import { slotToLabel, fmtDayHeader, MONTH_NAMES_RU, stableColorFromString } from '../utils'
import CellModal from './CellModal.vue'
import DayModal from './DayModal.vue'

const cal = useCalendarStore()
const auth = useAuthStore()

// Scroll sync refs
const rightBody = ref(null)
const leftBody = ref(null)
const hScroll = ref(null)

// Month/year selectors
const monthIdx = ref(cal.currentWeekStart.value.getMonth())
const yearVal = ref(cal.currentWeekStart.value.getFullYear())

function buildYearList(base) {
  const cur = new Date().getFullYear()
  const start = (base >= cur - 5 && base <= cur) ? cur - 5 : base - 5
  const end = (base >= cur - 5 && base <= cur) ? cur : base + 5
  const years = []
  for (let y = start; y <= end; y++) years.push(y)
  return years
}
const yearList = computed(() => buildYearList(yearVal.value))

// Sync selects when week changes
watch(() => cal.currentWeekStart.value, (d) => {
  monthIdx.value = d.getMonth()
  yearVal.value = d.getFullYear()
  loadWeek()
})

async function loadWeek() {
  await cal.loadWeek()
}

async function onMonthYearChange() {
  cal.jumpToMonth(yearVal.value, monthIdx.value)
}

// Navigation
async function onPrev() { cal.prevWeek(); await loadWeek() }
async function onNext() { cal.nextWeek(); await loadWeek() }
async function onToday() { cal.goToday(); await loadWeek() }

// Scroll sync
function onRightBodyScroll() {
  if (leftBody.value) leftBody.value.scrollTop = rightBody.value.scrollTop
}
function forwardWheel(e) {
  if (Math.abs(e.deltaX) > 0) {
    hScroll.value.scrollLeft += e.deltaX
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) e.preventDefault()
  }
}

// Cell modal
const cellModal = ref(null)
function openCell(dateISO, slot) {
  cellModal.value?.open(dateISO, slot)
}

// Day modal
const dayModal = ref(null)
function openDay(dateISO) {
  dayModal.value?.open(dateISO)
}

function projectForPid(pid) {
  // access via store not imported here to avoid circular — use window store
  return window.__projStore?.byId(pid) ?? null
}

function cellColor(pid) {
  const p = projectForPid(pid)
  return p?.color ?? stableColorFromString(pid)
}

function cellName(pid) {
  const p = projectForPid(pid)
  return p ? p.name : '— (проект удалён)'
}

// expose store ref for helper
import { useProjectsStore } from '../stores/projects'
const projStore = useProjectsStore()

onMounted(() => {
  window.__projStore = projStore
  loadWeek()
})
</script>

<template>
  <div>
    <!-- Navigation row -->
    <div class="row">
      <div class="controls calendarNavControls">
        <button class="btn icon" title="Предыдущая неделя" @click="onPrev">←</button>
        <button class="btn" @click="onToday">Текущая неделя</button>
        <button class="btn icon" title="Следующая неделя" @click="onNext">→</button>

        <select v-model="monthIdx" class="select" @change="onMonthYearChange">
          <option v-for="(name, i) in MONTH_NAMES_RU" :key="i" :value="i">{{ name }}</option>
        </select>

        <select v-model="yearVal" class="select mono" @change="onMonthYearChange">
          <option v-for="y in yearList" :key="y" :value="y">{{ y }}</option>
        </select>

        <span class="pillNote">
          <span class="kbd">Клик</span> по дате в заголовке: <b>Рабочий ↔ Выходной</b>
        </span>
      </div>
      <div class="controls">
        <span class="small muted"><span class="kbd">Esc</span> — закрыть окно.</span>
      </div>
    </div>

    <!-- Grid -->
    <div class="gridWrap">
      <div class="gridShell">
        <!-- Left time column -->
        <div class="leftCol">
          <div class="leftHeader">Время</div>
          <div
            ref="leftBody"
            class="leftBody"
            @wheel="forwardWheel"
          >
            <div
              v-for="slot in cal.slots"
              :key="slot"
              class="tcell mono"
            >{{ slotToLabel(slot) }}</div>
          </div>
        </div>

        <!-- Right: header + body -->
        <div class="rightCol">
          <div ref="hScroll" class="hScroll">
            <!-- Day headers -->
            <div
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
              >{{ fmtDayHeader(col.date) }}</div>
            </div>

            <!-- Body rows -->
            <div
              ref="rightBody"
              class="rightBody"
              @scroll="onRightBodyScroll"
              @wheel="forwardWheel"
            >
              <div
                v-for="slot in cal.slots"
                :key="slot"
                class="gRow"
                :style="{ gridTemplateColumns: `repeat(${cal.columns.length}, minmax(0, 1fr))` }"
              >
                <div
                  v-for="col in cal.columns"
                  :key="col.iso"
                  class="cell"
                  :class="cal.slotMultiplier(col.iso, slot) === 1.0 ? 'normal' : 'premium'"
                  @click="openCell(col.iso, slot)"
                >
                  <div
                    v-if="cal.getCell(col.iso, slot).length > 0"
                    class="cellPills"
                  >
                    <div
                      v-for="pid in cal.getCell(col.iso, slot)"
                      :key="pid"
                      class="pill small"
                      :class="{ half: cal.isHalfCell(col.iso, slot) && cal.getCell(col.iso, slot).length === 1 }"
                    >
                      <span class="dot" :style="{ background: cellColor(pid) }"></span>
                      <span class="pname">{{ cellName(pid) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="hint">
      В одной ячейке можно хранить 1 или 2 задачи: 1 задача = 0.5ч, 2 задачи = по 0.25ч каждая.
    </div>

    <!-- Modals -->
    <CellModal ref="cellModal" />
    <DayModal ref="dayModal" />
  </div>
</template>
