<script setup>
import { useI18n } from '../i18n/index.js'
import { ref, computed } from 'vue'
import { useProjectsStore } from '../stores/projects'
import { useCalendarStore } from '../stores/calendar'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { randomProjectColor, stableColorFromString, colorKeyToHex, hexToColorKey, PALETTE_KEYS } from '../utils'
import GroupModal from './GroupModal.vue'
import ColorPicker from './ColorPicker.vue'
import ConfirmDeleteModal from './ConfirmDeleteModal.vue'

const proj = useProjectsStore()
const cal = useCalendarStore()
const auth = useAuthStore()
const toast = useToastStore()
const { t } = useI18n()

const showArchived = ref(false)
const newGroup = ref('')
const newName = ref('')
const newBudget = ref('')

const groupModal = ref(null)
const colorPicker = ref(null)
const confirmDeleteModal = ref(null)
let colorPickCb = null

const visibleProjects = computed(() =>
  proj.list.filter(p => showArchived.value || !p.archived)
)

const groupedProjects = computed(() => {
  const groups = {}
  for (const p of visibleProjects.value) {
    const g = (p.group || '').trim() || '—'
    if (!groups[g]) groups[g] = []
    groups[g].push(p)
  }
  const keys = Object.keys(groups).sort((a, b) => {
    if (a === '—') return 1
    if (b === '—') return -1
    return a.localeCompare(b, 'ru')
  })
  return keys.map(k => ({ name: k, projects: groups[k] }))
})

function hoursFor(p) {
  return { real: p.totalRealHours ?? 0, weighted: p.totalWeightedHours ?? 0 }
}

function rateFor(p) {
  return p.totalWeightedHours > 0 ? p.budget / p.totalWeightedHours : null
}

function dotColor(p) {
  if (p.color) return colorKeyToHex(p.color)
  return stableColorFromString(p.id)
}

function fmtNum(v) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

function fmtBudget(v) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

// Для бюджет-инпута: при фокусе показываем число, при блюре — форматированное
const focusedBudgetId = ref(null)
function onBudgetFocus(p) { focusedBudgetId.value = p.id }
function onBudgetBlur(p, e) { focusedBudgetId.value = null; saveBudget(p, e.target.value) }
function budgetDisplayValue(p) {
  if (focusedBudgetId.value === p.id) return p.budget.toFixed(2)
  return fmtBudget(p.budget)
}

function fmtHours(h) {
  if (h === 0) return '0'
  const r = Math.round(h * 100) / 100
  if (r % 1 === 0) return String(Math.round(r))
  return r.toFixed(2).replace('.', ',')
}

async function addProject() {
  if (!auth.isAuthed) { toast.warn(t('errors.needLogin')); return }
  const name = newName.value.trim()
  const group = newGroup.value.trim()
  const budget = Number(newBudget.value)
  if (!name) { toast.warn(t('errors.nameRequired')); return }
  if (!Number.isFinite(budget) || budget < 0) { toast.warn(t('errors.budgetInvalid')); return }

  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '_' + Math.random().toString(16).slice(2)
  const p = { id, name, group, budget, color: randomProjectColor(), comment: '', paid: false, archived: false, createdAt: Date.now() }

  proj.localAdd(p)
  newGroup.value = ''
  newName.value = ''
  newBudget.value = ''

  proj.save(p).catch(e => {
    proj.localRemove(p.id)
    console.error(e)
    toast.error(t('errors.createProject'))
  })
}

async function removeProject(p) {
  const confirmed = await confirmDeleteModal.value.open(p.name)
  if (!confirmed) return

  proj.localRemove(p.id)
  for (const k in cal.entries) {
    const arr = cal.entries[k]
    if (Array.isArray(arr) && arr.includes(p.id)) {
      const rest = arr.filter(x => x !== p.id)
      if (rest.length === 0) delete cal.entries[k]
      else cal.entries[k] = rest.slice(0, 2)
    }
  }

  proj.remove(p.id).catch(async e => {
    console.error(e)
    toast.error(t('errors.deleteProject'))
    await proj.fetch() // откат — перезагружаем список
  })
}

function savePaidToggle(p) {
  // p.paid уже установлен в нужное значение до вызова этой функции
  p.archived = !!p.paid
  proj.localUpdate({ id: p.id, paid: p.paid, archived: p.archived })
  const savedPaid = p.paid
  proj.save(p).catch(async e => {
    console.error(e)
    toast.error(t('errors.saveChange'))
    p.paid = !savedPaid
    p.archived = !!p.paid
    proj.localUpdate({ id: p.id, paid: p.paid, archived: p.archived })
  })
}

function saveNameChange(p, input) {
  const v = (input.value || '').trim()
  if (!v) { input.value = p.name; toast.warn(t('errors.nameEmpty')); return }
  if (v === p.name) return
  const prev = p.name
  p.name = v
  proj.localUpdate({ id: p.id, name: v })
  proj.save(p).catch(e => {
    console.error(e)
    toast.error(t('errors.saveName'))
    p.name = prev
    input.value = prev
    proj.localUpdate({ id: p.id, name: prev })
  })
}

function saveBudget(p, val) {
  const v = Number(val)
  if (!Number.isFinite(v) || v < 0) { toast.warn(t('errors.budgetPositive')); return }
  const prev = p.budget
  p.budget = v
  proj.localUpdate({ id: p.id, budget: v })
  proj.save(p).catch(e => {
    console.error(e)
    toast.error(t('errors.saveBudget'))
    p.budget = prev
    proj.localUpdate({ id: p.id, budget: prev })
  })
}

function saveComment(p) {
  const prev = p.comment
  proj.save(p).catch(e => {
    console.error(e)
    p.comment = prev
    proj.localUpdate({ id: p.id, comment: prev })
    toast.error(t('errors.saveComment'))
  })
}

function openGroupModal(pid) {
  groupModal.value?.open(pid)
}

function openColorPicker(e, p) {
  e.stopPropagation()
  colorPickCb = (key) => {
    const prev = p.color
    p.color = key
    proj.localUpdate({ id: p.id, color: key })
    proj.save(p).catch(err => {
      console.error(err)
      toast.error(t('errors.saveColor'))
      p.color = prev
      proj.localUpdate({ id: p.id, color: prev })
    })
  }
  colorPicker.value?.open(e.clientX, e.clientY)
}

function onColorPick(hex) {
  colorPickCb?.(hex)
  colorPickCb = null
}

// Мобильный диалог архивации — использует тот же ConfirmDeleteModal
async function onMobilePaidChange(p) {
  if (!p.paid) {
    const confirmed = await confirmDeleteModal.value.open(p.name, {
      title:        t('confirm.archiveProject'),
      bodyPrefix:   t('confirm.archiveProjectBody'),
      bodySuffix:   t('confirm.archiveProjectSuffix'),
      subtext:      '',
      confirmLabel: t('projects.archiveTitle'),
      danger:       false,
    })
    if (!confirmed) return
    p.paid = true
    savePaidToggle(p)
  } else {
    // Уже архивирован — снимаем сразу без диалога
    p.paid = false
    savePaidToggle(p)
  }
}
</script>

<template>
  <div class="pt-root">

    <!-- ── Add project bar ── -->
    <div class="pt-addbar">
      <div class="pt-addinputs">
        <div class="pt-input-row pt-input-row-names">
          <input
            v-model="newGroup"
            class="input pt-input"
            :placeholder="t('projects.groupPlaceholder')"
            list="groupsDatalistTab"
          />
          <datalist id="groupsDatalistTab">
            <option v-for="g in proj.allGroups" :key="g" :value="g" />
          </datalist>
          <input v-model="newName" class="input pt-input pt-input-wide" :placeholder="t('projects.namePlaceholder')" />
        </div>
        <div class="pt-input-row pt-input-row-budget">
          <input
            v-model="newBudget"
            class="input pt-input pt-input-budget"
            :class="{ mono: newBudget !== '' }"
            type="number"
            min="0"
            step="0.01"
            :placeholder="t('projects.budgetPlaceholder')"
          />
          <button class="btn primary pt-add-btn" @click="addProject">{{ t('btn.addProject') }}</button>
        </div>
      </div>
      <div class="pt-addbar-sep"></div>
      <div class="pt-addactions">
        <button class="btn" :disabled="cal.allHoursLoading" @click="cal.calcAllHours()">
          {{ cal.allHoursLoading ? '…' : t('btn.recalc') }}
        </button>
        <button class="btn" @click="showArchived = !showArchived">
          {{ showArchived ? t('btn.hideArchived') : t('btn.showArchived') }}
        </button>
      </div>
    </div>

    <!-- ── Empty state ── -->
    <div v-if="visibleProjects.length === 0" class="pt-empty">
      {{ showArchived ? t('state.noProjects') : t('state.noActiveProjects') }}
    </div>

    <!-- ── Project groups ── -->
    <div class="pt-content">
      <div v-for="group in groupedProjects" :key="group.name" class="pt-group">

        <!-- Group header -->
        <div class="pt-group-header">
          <span class="pt-group-name">{{ group.name }}</span>
          <div class="pt-group-line"></div>
          <span class="pt-group-count">{{ t('projects.count', { n: group.projects.length }) }}</span>
        </div>

        <!-- Column headers -->
        <div class="pt-cols pt-cols-header">
          <span></span>
          <span>{{ t('projects.colName') }}</span>
          <span>{{ t('projects.colHours') }}</span>
          <span>{{ t('projects.colBudget') }}</span>
          <span>{{ t('projects.colRate') }}</span>
          <span>{{ t('projects.colComment') }}</span>
          <span></span>
        </div>

        <!-- Project rows -->
        <div
          v-for="p in group.projects"
          :key="p.id"
          class="pt-cols pt-row"
          :class="{ 'pt-row-paid': p.paid, 'pt-row-archived': p.archived }"
        >
          <!-- Color dot -->
          <div class="pt-dot-wrap">
            <span
              class="pt-dot"
              :style="{ background: dotColor(p) }"
              :title="t('projects.changeColor')"
              @click="openColorPicker($event, p)"
            ></span>
          </div>

          <!-- Name -->
          <div class="pt-name-wrap">
            <input
              class="input pt-name-input"
              type="text"
              :value="p.name"
              @keydown.enter="e => e.target.blur()"
              @change="e => saveNameChange(p, e.target)"
            />
          </div>

          <!-- Hours real / weighted -->
          <div class="pt-hours">
            <span class="mono pt-hours-real">{{ fmtHours(hoursFor(p).real) }}</span>
            <span class="pt-hours-sep">/</span>
            <span class="mono pt-hours-w">{{ fmtHours(hoursFor(p).weighted) }}</span>
          </div>

          <!-- Budget -->
          <div>
            <input
              class="input pt-budget-input mono"
              type="text"
              inputmode="decimal"
              :value="budgetDisplayValue(p)"
              @focus="onBudgetFocus(p)"
              @blur="e => onBudgetBlur(p, e)"
              @keydown.enter="e => e.target.blur()"
            />
          </div>

          <!-- Rate -->
          <div class="mono pt-rate" :class="{ 'pt-rate-empty': rateFor(p) === null }">
            {{ rateFor(p) === null ? '—' : fmtNum(rateFor(p)) }}
          </div>

          <!-- Comment -->
          <div class="pt-comment-wrap">
            <textarea
              v-model="p.comment"
              class="textarea pt-comment"
              :placeholder="t('projects.commentPlaceholder')"
              @input="saveComment(p)"
            ></textarea>
          </div>

          <!-- Actions -->
          <div class="pt-actions">
            <label class="pt-paid-label" :title="p.paid ? t('projects.paidTitle') : t('projects.archiveTitle')">
              <input v-model="p.paid" class="ck" type="checkbox" @change="savePaidToggle(p)" />
              <span class="pt-paid-icon">{{ p.paid ? '✓' : '○' }}</span>
            </label>
            <button class="btn pt-icon-btn" :title="t('projects.changeGroup')" @click="openGroupModal(p.id)">⊞</button>
            <button class="btn danger icon pt-icon-btn" :title="t('projects.deleteProject')" @click="removeProject(p)">✕</button>
          </div>
        </div>

        <!-- Мобильные карточки -->
        <div
          v-for="p in group.projects"
          :key="'mob-' + p.id"
          class="pt-card"
          :class="{ 'pt-card-paid': p.paid, 'pt-card-archived': p.archived }"
        >
          <!-- Верхняя строка: цвет + название + действия -->
          <div class="pt-card-head">
            <span
              class="pt-dot"
              :style="{ background: dotColor(p) }"
              @click="openColorPicker($event, p)"
            ></span>
            <input
              class="input pt-name-input pt-card-name"
              type="text"
              :value="p.name"
              @keydown.enter="e => e.target.blur()"
              @change="e => saveNameChange(p, e.target)"
            />
            <div class="pt-card-actions">
              <button
                class="pt-paid-label"
                :title="p.paid ? t('projects.unarchiveTitle') : t('projects.archiveTitle')"
                @click="onMobilePaidChange(p)"
              >
                <span class="pt-paid-icon">{{ p.paid ? '✓' : '○' }}</span>
              </button>
              <button class="btn pt-icon-btn" @click="openGroupModal(p.id)">⊞</button>
              <button class="btn danger icon pt-icon-btn" @click="removeProject(p)">✕</button>
            </div>
          </div>

          <!-- Статистика -->
          <div class="pt-card-stats">
            <div class="pt-card-stat">
              <span class="pt-card-stat-label">{{ t('projects.colHours') }}</span>
              <span class="mono">{{ fmtHours(hoursFor(p).real) }} / {{ fmtHours(hoursFor(p).weighted) }}</span>
            </div>
            <div class="pt-card-stat">
              <span class="pt-card-stat-label">{{ t('projects.colBudget') }}</span>
              <input
                class="input pt-budget-input mono"
                type="text"
                inputmode="decimal"
                :value="budgetDisplayValue(p)"
                @focus="onBudgetFocus(p)"
                @blur="e => onBudgetBlur(p, e)"
                @keydown.enter="e => e.target.blur()"
              />
            </div>
            <div class="pt-card-stat">
              <span class="pt-card-stat-label">{{ t('projects.colRate') }}</span>
              <span class="mono pt-rate" :class="{ 'pt-rate-empty': rateFor(p) === null }">
                {{ rateFor(p) === null ? '—' : fmtNum(rateFor(p)) }}
              </span>
            </div>
          </div>

          <!-- Комментарий -->
          <textarea
            v-model="p.comment"
            class="textarea pt-comment pt-card-comment"
            :placeholder="t('projects.commentPlaceholder')"
            @input="saveComment(p)"
          ></textarea>
        </div>

      </div>
    </div>

    <!-- ── Footer ── -->
    <!-- (кнопка архива перенесена в шапку) -->

    <GroupModal ref="groupModal" />
    <ColorPicker ref="colorPicker" @pick="onColorPick" />
    <ConfirmDeleteModal ref="confirmDeleteModal" />
  </div>
</template>

<style scoped>
.pt-root { padding: 0; }

/* ── Add bar ── */
.pt-addbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  flex-wrap: wrap;
}
.pt-addinputs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  flex: 1;
  min-width: 0;
}
.pt-input-row {
  display: contents; /* на десктопе строки прозрачны — всё в один ряд */
}
.pt-input { min-width: 100px; flex: 1; }
.pt-input-wide { min-width: 180px; flex: 2; }
.pt-input-budget { min-width: 100px; flex: 1; }
.pt-addbar-sep {
  width: 1px;
  height: 28px;
  background: var(--border);
  flex-shrink: 0;
}
.pt-addactions { display: flex; gap: 8px; flex-shrink: 0; }

/* ── Empty ── */
.pt-empty {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

/* ── Content ── */
.pt-content { padding: 16px 14px 8px; }

/* ── Group block ── */
.pt-group {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 16px;
}

.pt-group-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 20px;
  background: var(--surface-raised);
  border-bottom: 1px solid var(--border);
}
.pt-group-name {
  font-family: ui-monospace, monospace;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--accent-text);
  text-transform: uppercase;
}
.pt-group-line {
  flex: 1;
  height: 1px;
  background: rgba(232,213,183,0.15);
}
.pt-group-count {
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--text-muted);
}

/* ── Column grid: dot | name | hours | budget | rate | comment | actions ── */
.pt-cols {
  display: grid;
  grid-template-columns: 26px 1fr 110px 130px 100px 1fr 96px;
  gap: 10px;
  padding: 8px 20px;
  align-items: center;
}

.pt-cols-header span {
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-faint);
  font-family: ui-monospace, monospace;
}

/* ── Project row ── */
.pt-row {
  padding: 8px 20px;
  border-bottom: 1px solid var(--surface-raised);
  transition: background 0.12s;
  cursor: default;
}
.pt-row:last-child { border-bottom: none; }
.pt-row:hover { background: var(--surface); }
.pt-row-paid { background: var(--paid-bg); }
.pt-row-archived { opacity: 0.5; }

/* Color dot */
.pt-dot-wrap { display: flex; align-items: center; justify-content: center; }
.pt-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  border: 1.5px solid rgba(255,255,255,0.18);
}
.pt-dot:hover {
  transform: scale(1.45);
  box-shadow: 0 0 7px var(--text-muted);
}

/* Name input */
.pt-name-wrap { overflow: hidden; }
.pt-name-input {
  width: 100%;
  font-size: 13px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text);
  padding: 5px 7px;
  border-radius: 8px;
  transition: border-color 0.15s, background 0.15s;
}
.pt-name-input:hover {
  border-color: var(--border-strong);
  background: var(--surface-raised);
}
.pt-name-input:focus {
  border-color: var(--blue-border);
  background: var(--blue-dim);
  outline: none;
}

/* Hours */
.pt-hours { display: flex; align-items: center; gap: 4px; }
.pt-hours-real { font-family: ui-monospace, monospace; font-size: 12px; color: var(--text-dim); }
.pt-hours-sep { font-size: 11px; color: var(--text-faint); }
.pt-hours-w { font-family: ui-monospace, monospace; font-size: 13px; color: var(--accent-text); font-weight: 600; }

/* Budget input */
.pt-budget-input {
  width: 100%;
  font-size: 13px;
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text);
  padding: 5px 8px;
  border-radius: 8px;
  transition: border-color 0.15s, background 0.15s;
}
.pt-budget-input:hover {
  border-color: var(--border-strong);
  background: var(--surface-raised);
}
.pt-budget-input:focus {
  border-color: var(--blue-border);
  background: var(--blue-dim);
  outline: none;
}

/* Rate */
.pt-rate {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  color: var(--accent);
  font-weight: 600;
}
.pt-rate-empty { color: var(--text-faint); }

/* Comment */
.pt-comment-wrap { overflow: hidden; }
.pt-comment {
  width: 100%;
  min-height: 32px;
  max-height: 72px;
  font-size: 12px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-dim);
  padding: 5px 7px;
  border-radius: 8px;
  resize: vertical;
  transition: border-color 0.15s, background 0.15s;
  font-family: inherit;
}
.pt-comment:hover {
  border-color: var(--border-strong);
  background: var(--surface);
}
.pt-comment:focus {
  border-color: var(--blue-dim);
  background: rgba(106,166,255,0.05);
  outline: none;
}

/* Actions */
.pt-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
}
.pt-paid-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  /* сброс стилей кнопки (используется и как <label>, и как <button>) */
  background: transparent;
  border: none;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
}
.pt-paid-label input { display: none; }
.pt-paid-icon {
  font-size: 15px;
  color: var(--paid-text);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 1px solid transparent;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.pt-paid-label:hover .pt-paid-icon {
  color: rgba(102,255,166,0.85);
  border-color: rgba(102,255,166,0.25);
  background: rgba(102,255,166,0.07);
}
.pt-row-paid .pt-paid-icon { color: #66ffa6; }
.pt-card-paid .pt-paid-icon { color: #66ffa6; }

.pt-icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  flex-shrink: 0;
}

/* ── Footer ── */
.pt-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px 14px;
  flex-wrap: wrap;
}
.pt-hint {
  font-size: 12px;
  color: rgba(255,255,255,0.22);
}

.mono { font-family: ui-monospace, monospace; }

/* ── Мобильные карточки ── */
.pt-card { display: none; }

@media (max-width: 640px) {
  /* Скрываем таблицу, показываем карточки */
  .pt-cols { display: none !important; }
  .pt-card { display: block; }

  .pt-content { padding: 10px 10px 6px; }

  .pt-card {
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    padding: 14px;
    margin-bottom: 10px;
  }
  .pt-card-paid {
    background: var(--paid-bg);
    border-color: var(--paid-border);
  }
  .pt-card-archived { opacity: 0.5; }

  .pt-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .pt-card-head .pt-dot {
    flex-shrink: 0;
    /* выровнять по высоте кнопок 28px */
    margin: 0;
  }
  .pt-card-name {
    flex: 1;
    min-width: 0;
    font-size: 14px;
  }
  .pt-card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  /* Кнопки в карточке — те же размеры что в десктопе */
  .pt-card-actions .pt-paid-label,
  .pt-card-actions .pt-icon-btn {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
  }

  .pt-card-stats {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .pt-card-stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 80px;
  }
  .pt-card-stat-label {
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--text-muted);
    font-family: ui-monospace, monospace;
  }
  .pt-card-comment {
    width: 100%;
    box-sizing: border-box;
  }

  /* Форма добавления на мобильном */
  .pt-addbar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 10px 12px;
    box-sizing: border-box;
  }
  .pt-addinputs {
    flex-direction: column;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
  }
  .pt-input-row {
    display: flex;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
  }
  /* Группа + Название — 50/50 */
  .pt-input-row-names .pt-input,
  .pt-input-row-names .pt-input-wide {
    flex: 1 1 0;
    min-width: 0;
    width: 0; /* сбрасываем чтобы flex-basis работал */
    box-sizing: border-box;
  }
  /* Бюджет (75%) + Добавить (25%) */
  .pt-input-row-budget .pt-input-budget {
    flex: 3 1 0;
    min-width: 0;
    width: 0;
    box-sizing: border-box;
  }
  .pt-input-row-budget .pt-add-btn {
    flex: 1 1 0;
    min-width: 0;
    width: 0;
    white-space: nowrap;
    box-sizing: border-box;
  }
  .pt-addbar-sep {
    width: 100%;
    height: 1px;
    background: var(--border);
  }
  /* Кнопки под разделителем — 50/50 */
  .pt-addactions {
    display: flex;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
  }
  .pt-addactions .btn {
    flex: 1 1 0;
    min-width: 0;
    text-align: center;
    justify-content: center;
    box-sizing: border-box;
  }

  /* Группы */
  .pt-group-header { padding: 10px 14px; }
  .pt-group-name { font-size: 13px; }

  /* Карточки внутри группы — отступ от границ группы */
  .pt-group .pt-card { margin: 8px 8px 0 8px; }
  .pt-group .pt-card:last-of-type { margin-bottom: 8px; }
}
</style>
