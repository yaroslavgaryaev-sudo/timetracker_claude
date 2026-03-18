<script setup>
import { useI18n } from '../i18n/index.js'
import { ref, computed } from 'vue'
import { useCalendarStore } from '../stores/calendar'
import { useProjectsStore } from '../stores/projects'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { slotToLabel, entryKey, colorKeyToHex, stableColorFromString } from '../utils'
import { onMounted, onUnmounted } from 'vue'

const cal = useCalendarStore()
const proj = useProjectsStore()
const auth = useAuthStore()
const toast = useToastStore()

const visible = ref(false)
const dateISO = ref('')
const slot = ref(0)
const task1 = ref('')
const task2 = ref('')
const isHalf = ref(false)

const selectable = computed(() => proj.list.filter(p => !p.archived))
const { t } = useI18n()
const selectableIds = computed(() => new Set(selectable.value.map(p => p.id)))

// ── Быстрый доступ ────────────────────────────────────────────────────────────
// Читаем из cal.usageStats — загружается при логине одним лёгким запросом,
// обновляется локально при каждом saveCell без доп. запросов к БД.

const quickAccess = computed(() => {
  const stats = cal.usageStats  // { [pid]: { count, lastDate } }
  const activePids = Object.keys(stats).filter(pid => selectableIds.value.has(pid))
  if (!activePids.length) return { recent: [], popular: [] }

  const toPill = pid => {
    const p = proj.byId(pid)
    return {
      id: pid,
      name: p ? p.name : pid.slice(0, 6),
      color: p ? (colorKeyToHex(p.color) ?? stableColorFromString(pid)) : stableColorFromString(pid),
    }
  }

  // Топ-2 по количеству использований
  const byFreq = [...activePids].sort((a, b) => stats[b].count - stats[a].count)
  const top2 = byFreq.slice(0, 2)

  // Последние 3 по дате (не пересекаются с top2)
  const top2set = new Set(top2)
  const recent3 = [...activePids]
    .filter(pid => !top2set.has(pid))
    .sort((a, b) => (stats[b].lastDate || '').localeCompare(stats[a].lastDate || ''))
    .slice(0, 3)

  return { recent: recent3.map(toPill), popular: top2.map(toPill) }
})

const hasQuick = computed(() =>
  quickAccess.value.recent.length > 0 || quickAccess.value.popular.length > 0
)

// Светлые цвета — тёмный текст
const LIGHT_KEYS = new Set(['oat', 'cream', 'sage', 'peach', 'honey', 'butch'])
function quickTextColor(p) {
  const proj_ = proj.byId(p.id)
  return proj_ && LIGHT_KEYS.has(proj_.color) ? '#1a1a1a' : 'rgba(255,255,255,0.92)'
}

function applyQuick(pid, slot_) {
  if (slot_ === 1) task1.value = pid
  else task2.value = pid
}
// ─────────────────────────────────────────────────────────────────────────────

const meta = computed(() => {
  if (!dateISO.value) return ''
  const mult = cal.slotMultiplier(dateISO.value, slot.value)
  const label = isHalf.value && task2.value
    ? t('cell.slot025')
    : (isHalf.value ? t('cell.slotHalf') : t('cell.slotFull'))
  return `${dateISO.value} · ${slotToLabel(slot.value)}–${slotToLabel(slot.value + 1)} · ×${mult} · ${label}`
})

function open(d, s) {
  if (!auth.isAuthed) { toast.warn(t('errors.needLoginSave')); return }
  dateISO.value = d
  slot.value = s
  const tasks = cal.getCell(d, s)
  const k = entryKey(d, s)
  const half = !!cal.cellHalf[k] && tasks.length === 1
  task1.value = tasks[0] ?? (selectable.value[0]?.id ?? '')
  task2.value = tasks[1] ?? ''
  isHalf.value = half || tasks.length === 2
  visible.value = true
}

function close() { visible.value = false }

function onHalfToggle() {
  if (!isHalf.value) task2.value = ''
}

function save() {
  const next = []
  if (task1.value) next.push(task1.value)
  if (isHalf.value && task2.value) next.push(task2.value)
  const halfCell = isHalf.value && !task2.value
  cal.saveCell(dateISO.value, slot.value, next, halfCell)
  close() // закрываем мгновенно — saveCell обновляет state оптимистично
}

function clear() {
  cal.saveCell(dateISO.value, slot.value, [], false)
  close()
}

function onKey(e) { if (e.key === 'Escape') close() }
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="m-backdrop" @click.self="close">
      <div class="m-box" role="dialog" aria-modal="true">

        <!-- Head -->
        <div class="m-head">
          <div class="m-head-left">
            <span class="m-icon">✦</span>
            <span class="m-title">{{ t('cell.title') }}</span>
          </div>
          <button class="m-close" title="Закрыть (Esc)" @click="close">✕</button>
        </div>


        <!-- Body -->
        <div class="m-body">
          <div v-if="selectable.length === 0" class="m-empty">
            {{ t('cell.noProjects') }}
          </div>

          <div v-else class="m-fields">

            <!-- Quick access: task 1 -->
            <div v-if="hasQuick" class="m-quick">
              <div class="m-quick-labels">
                <span v-if="quickAccess.recent.length > 0" class="m-quick-label"
                  :style="{ width: quickAccess.recent.length * 79 + 'px' }">{{ t('cell.recent') }}</span>
                <span v-if="quickAccess.popular.length > 0" class="m-quick-label">{{ t('cell.popular') }}</span>
              </div>
              <div class="m-quick-row">
                <!-- Десктоп: всё в одну строку -->
                <template v-if="quickAccess.recent.length > 0">
                  <div class="m-quick-group">
                    <span class="m-quick-group-label">{{ t('cell.recent') }}</span>
                    <div class="m-quick-group-pills">
                      <button
                        v-for="p in quickAccess.recent" :key="p.id"
                        class="m-qpill"
                        :class="{ 'is-active': task1 === p.id }"
                        :style="{ background: p.color, color: quickTextColor(p) }"
                        :title="p.name"
                        @click="applyQuick(p.id, 1)"
                      >{{ p.name }}</button>
                    </div>
                  </div>
                </template>
                <div v-if="quickAccess.recent.length > 0 && quickAccess.popular.length > 0" class="m-quick-sep"></div>
                <template v-if="quickAccess.popular.length > 0">
                  <div class="m-quick-group">
                    <span class="m-quick-group-label">{{ t('cell.popular') }}</span>
                    <div class="m-quick-group-pills">
                      <button
                        v-for="p in quickAccess.popular" :key="p.id"
                        class="m-qpill"
                        :class="{ 'is-active': task1 === p.id }"
                        :style="{ background: p.color, color: quickTextColor(p) }"
                        :title="p.name"
                        @click="applyQuick(p.id, 1)"
                      >{{ p.name }}</button>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- Task 1 row: select + half checkbox -->
            <div class="m-row1">
              <select v-model="task1" class="m-select">
                <option v-for="p in selectable" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
              <label class="m-ck-label-wrap" title="Пол-ячейки — добавить вторую задачу">
                <input v-model="isHalf" type="checkbox" class="m-ck-input" @change="onHalfToggle" />
                <span class="m-ck-box"></span>
                <span class="m-ck-text">{{ t('cell.halfLabel') }}</span>
              </label>
            </div>

            <!-- Task 2: shown only when isHalf -->
            <div v-if="isHalf" class="m-field">
              <label class="m-label">{{ t('cell.task2Label') }} <span class="m-label-opt">(опционально)</span></label>

              <select v-model="task2" class="m-select m-select-plain">
                <option value="">— нет —</option>
                <option v-for="p in selectable" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>

              <!-- Quick access: task 2 — под полем -->
              <div v-if="hasQuick" class="m-quick m-quick-compact">
                <div class="m-quick-labels">
                  <span v-if="quickAccess.recent.length > 0" class="m-quick-label"
                    :style="{ width: quickAccess.recent.length * 79 + 'px' }">{{ t('cell.recent') }}</span>
                  <span v-if="quickAccess.popular.length > 0" class="m-quick-label">{{ t('cell.popular') }}</span>
                </div>
                <div class="m-quick-row">
                  <template v-if="quickAccess.recent.length > 0">
                    <div class="m-quick-group">
                      <span class="m-quick-group-label">{{ t('cell.recent') }}</span>
                      <div class="m-quick-group-pills">
                        <button
                          v-for="p in quickAccess.recent" :key="p.id"
                          class="m-qpill"
                          :class="{ 'is-active': task2 === p.id }"
                          :style="{ background: p.color, color: quickTextColor(p) }"
                          :title="p.name"
                          @click="applyQuick(p.id, 2)"
                        >{{ p.name }}</button>
                      </div>
                    </div>
                  </template>
                  <div v-if="quickAccess.recent.length > 0 && quickAccess.popular.length > 0" class="m-quick-sep"></div>
                  <template v-if="quickAccess.popular.length > 0">
                    <div class="m-quick-group">
                      <span class="m-quick-group-label">{{ t('cell.popular') }}</span>
                      <div class="m-quick-group-pills">
                        <button
                          v-for="p in quickAccess.popular" :key="p.id"
                          class="m-qpill"
                          :class="{ 'is-active': task2 === p.id }"
                          :style="{ background: p.color, color: quickTextColor(p) }"
                          :title="p.name"
                          @click="applyQuick(p.id, 2)"
                        >{{ p.name }}</button>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- Foot -->
        <div class="m-foot">
          <button class="m-btn m-btn-clear" @click="clear">{{ t('btn.clear') }}</button>
          <div style="flex:1"></div>
          <button class="m-btn" @click="close">{{ t('btn.cancel') }}</button>
          <button class="m-btn m-btn-primary" :disabled="selectable.length === 0" @click="save">
            {{ t('btn.save') }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.m-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: var(--backdrop);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 18px;
  animation: fadeIn .15s ease;
}
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

.m-box {
  width: min(520px, 100%);
  background: var(--surface-modal);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: 0 24px 64px var(--backdrop), 0 0 0 1px var(--surface-raised) inset;
  overflow: hidden;
  animation: slideUp .18s ease;
}
@keyframes slideUp { from { transform: translateY(10px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

/* Head */
.m-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-modal);
}
.m-head-left { display: flex; align-items: center; gap: 10px; }
.m-icon { font-size: 14px; color: var(--accent); opacity: .8; }
.m-title {
  font-family: ui-monospace, monospace;
  font-size: 13px; font-weight: 700;
  letter-spacing: 1.5px; text-transform: uppercase;
  color: var(--accent-text);
}
.m-close {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-dim);
  width: 28px; height: 28px; border-radius: 8px;
  cursor: pointer; font-size: 12px;
  display: flex; align-items: center; justify-content: center;
  transition: background .12s, color .12s, border-color .12s;
  font-family: inherit;
}
.m-close:hover { background: rgba(255,100,100,0.12); border-color: rgba(255,100,100,0.35); color: var(--danger); }


/* Body */
.m-body { padding: 18px 18px 20px; background: var(--surface-modal); }

.m-empty { font-size: 13px; color: var(--text-dim); padding: 8px 0; }

.m-fields { display: flex; flex-direction: column; gap: 14px; }

/* Task 1 row: select + checkbox inline */
.m-row1 {
  display: flex; align-items: center; gap: 10px;
}

.m-field { display: flex; flex-direction: column; gap: 6px; }

.m-label {
  font-size: 11px; font-weight: 600; letter-spacing: 1px;
  text-transform: uppercase; color: var(--text-dim);
}
.m-label-opt { font-weight: 400; text-transform: none; letter-spacing: 0; opacity: .7; }

/* Select */
.m-select {
  flex: 1;
  background: var(--surface-input2);
  border: 1px solid var(--border-strong);
  color: var(--text);
  padding: 9px 32px 9px 12px;
  border-radius: 10px;
  font-size: 13px; font-family: inherit;
  outline: none; cursor: pointer;
  appearance: none; -webkit-appearance: none;
  background-image: var(--select-arrow);
  background-repeat: no-repeat;
  background-position: right 10px center;
  transition: border-color .12s;
}
.m-select:hover { border-color: var(--border-input); }
.m-select:focus { outline: none; border-color: var(--border-input); }
.m-select:disabled { opacity: .4; cursor: not-allowed; }

/* Task 2 select: no highlight on focus */
.m-select-plain:focus { border-color: var(--border); }

/* Checkbox: inline with label "15 МИН" */
.m-ck-label-wrap {
  display: flex; align-items: center; gap: 7px;
  cursor: pointer; flex-shrink: 0;
  user-select: none;
}
.m-ck-input { position: absolute; opacity: 0; width: 0; height: 0; }

.m-ck-box {
  position: relative;
  width: 20px; height: 20px; flex-shrink: 0;
  border-radius: 6px;
  border: 1px solid var(--text-faint);
  background: var(--surface-darker);
  transition: background .12s, border-color .12s;
}
.m-ck-input:checked ~ .m-ck-box {
  background: var(--accent-border);
  border-color: var(--accent-border);
}
.m-ck-input:checked ~ .m-ck-box::after {
  content: '';
  position: absolute;
  left: 6px; top: 3px;
  width: 5px; height: 9px;
  border-right: 2px solid var(--accent-text);
  border-bottom: 2px solid var(--accent-text);
  transform: rotate(45deg);
}
.m-ck-text {
  font-size: 12px; font-weight: 700; letter-spacing: 1px;
  color: var(--text-dim);
  font-family: ui-monospace, monospace;
}

/* Foot */
.m-foot {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-modal);
}

.m-btn {
  background: var(--surface-hover);
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
  padding: 8px 16px; border-radius: 10px;
  cursor: pointer; font-size: 13px; font-weight: 600;
  font-family: inherit;
  transition: background .12s, border-color .12s, color .12s;
}
.m-btn:hover { background: var(--border); color: #e8ecf7; }
.m-btn:disabled { opacity: .45; cursor: not-allowed; }

.m-btn-primary {
  background: var(--accent-dim);
  border-color: var(--accent-border);
  color: var(--accent-text);
}
.m-btn-primary:hover:not(:disabled) { background: var(--accent-dim); }

.m-btn-clear {
  background: transparent;
  border-color: rgba(233,0,0,0.5);
  color: #E90000;
}
.m-btn-clear:hover:not(:disabled) {
  background: rgba(233,0,0,0.1);
  border-color: #E90000;
  color: #ff2222;
}
/* Quick access */
.m-quick {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.m-quick-compact {
  margin-top: 8px;
}
.m-quick-labels {
  display: flex;
  align-items: center;
  gap: 5px;
}
.m-quick-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.1px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.22);
  font-family: ui-monospace, monospace;
  white-space: nowrap;
  flex-shrink: 0;
}
.m-quick-row {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 5px;
  overflow: hidden;
}
/* На десктопе группа — просто горизонтальный ряд пилюль без метки */
.m-quick-group {
  display: contents;
}
.m-quick-group-label {
  display: none;
}
.m-quick-group-pills {
  display: contents;
}
.m-quick-sep {
  width: 1px;
  height: 20px;
  background: var(--border-strong);
  flex-shrink: 0;
  margin: 0 2px;
}
.m-qpill {
  width: 74px;
  flex-shrink: 0;
  padding: 5px 0;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  border: 2px solid transparent;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  outline: none;
  opacity: 0.25;
  transition: transform .1s, opacity .15s;
}
.m-qpill:hover {
  transform: translateY(-1px);
  opacity: 0.6;
}
.m-qpill:active {
  transform: translateY(0);
}
.m-qpill.is-active {
  opacity: 1;
}

@media (max-width: 640px) {
  /* На мобильном — две строки: Последние и Популярные отдельно */
  .m-quick {
    gap: 6px;
  }
  .m-quick-labels {
    display: none; /* скрываем общий блок с метками — они встроены в строки */
  }
  .m-quick-row {
    flex-direction: column;
    align-items: stretch;
    overflow: visible;
    gap: 6px;
  }
  .m-quick-sep {
    display: none;
  }
  /* Каждая группа пилюль — отдельная строка с меткой */
  .m-quick-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .m-quick-group-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1.1px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.22);
    font-family: ui-monospace, monospace;
  }
  .m-quick-group-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .m-qpill {
    width: auto;
    flex: 1 1 auto;
    min-width: 60px;
    max-width: 100%;
    padding: 6px 8px;
  }
}
</style>
