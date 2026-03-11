<script setup>
import { ref, computed } from 'vue'
import { useProjectsStore } from '../stores/projects'
import { useCalendarStore } from '../stores/calendar'
import { useAuthStore } from '../stores/auth'
import { randomProjectColor, stableColorFromString, normalizeHexColor } from '../utils'
import GroupModal from './GroupModal.vue'
import ColorPicker from './ColorPicker.vue'

const proj = useProjectsStore()
const cal = useCalendarStore()
const auth = useAuthStore()

const showArchived = ref(false)
const newGroup = ref('')
const newName = ref('')
const newBudget = ref('')

const groupModal = ref(null)
const colorPicker = ref(null)
let colorPickCb = null

const visibleProjects = computed(() =>
  proj.list.filter(p => showArchived.value || !p.archived)
)

const hourMap = computed(() => cal.calcHoursByProject())

function hoursFor(id) {
  return hourMap.value.get(id) ?? { real: 0, weighted: 0 }
}

function rateFor(p) {
  const h = hoursFor(p.id)
  return h.weighted > 0 ? p.budget / h.weighted : null
}

function dotColor(p) {
  return p.color ?? stableColorFromString(p.id)
}

async function addProject() {
  if (!auth.isAuthed) { alert('Сначала войди по e-mail.'); return }
  const name = newName.value.trim()
  const group = newGroup.value.trim()
  const budget = Number(newBudget.value)
  if (!name) { alert('Введите название проекта.'); return }
  if (!Number.isFinite(budget) || budget < 0) { alert('Введите бюджет числом (0 или больше).'); return }

  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '_' + Math.random().toString(16).slice(2)
  const p = { id, name, group, budget, color: randomProjectColor(), comment: '', paid: false, archived: false, createdAt: Date.now() }

  try {
    await proj.save(p)
    await proj.fetch()
    newGroup.value = ''
    newName.value = ''
    newBudget.value = ''
  } catch (e) {
    console.error(e)
    alert('Ошибка сохранения проекта.')
  }
}

async function removeProject(p) {
  if (!confirm(`Удалить проект "${p.name}"?\nЯчейки с этим проектом будут очищены.`)) return
  try {
    await proj.remove(p.id)
    // Remove from entries cache
    for (const k in cal.entries) {
      const arr = cal.entries[k]
      if (Array.isArray(arr) && arr.includes(p.id)) {
        const rest = arr.filter(x => x !== p.id)
        if (rest.length === 0) delete cal.entries[k]
        else cal.entries[k] = rest.slice(0, 2)
      }
    }
    await proj.fetch()
  } catch (e) {
    console.error(e)
    alert('Ошибка удаления проекта.')
  }
}

async function savePaidToggle(p) {
  p.archived = !!p.paid
  try {
    await proj.save(p)
    await proj.fetch()
  } catch (e) {
    console.error(e)
    alert('Ошибка сохранения проекта.')
  }
}

async function saveNameChange(p, input) {
  const v = (input.value || '').trim()
  if (!v) { input.value = p.name; alert('Название проекта не может быть пустым.'); return }
  if (v === p.name) return
  const prev = p.name
  p.name = v
  try {
    await proj.save(p)
    await proj.fetch()
  } catch (e) {
    console.error(e)
    alert('Ошибка сохранения названия проекта.')
    p.name = prev
    input.value = prev
  }
}

async function saveBudget(p, val) {
  const v = Number(val)
  if (!Number.isFinite(v) || v < 0) { alert('Бюджет должен быть числом (0 или больше).'); return }
  p.budget = v
  try {
    await proj.save(p)
    await proj.fetch()
  } catch (e) {
    console.error(e)
    alert('Ошибка сохранения бюджета.')
  }
}

async function saveComment(p) {
  try { await proj.save(p) } catch (e) { console.error(e) }
}

function openGroupModal(pid) {
  groupModal.value?.open(pid)
}

function openColorPicker(e, p) {
  e.stopPropagation()
  colorPickCb = async (hex) => {
    const prev = p.color
    p.color = normalizeHexColor(hex)
    try {
      await proj.save(p)
      await proj.fetch()
    } catch (err) {
      console.error(err)
      alert('Ошибка сохранения цвета.')
      p.color = prev
    }
  }
  colorPicker.value?.open(e.clientX, e.clientY)
}

function onColorPick(hex) {
  colorPickCb?.(hex)
  colorPickCb = null
}
</script>

<template>
  <div>
    <!-- Add project row -->
    <div class="row">
      <div class="controls">
        <input
          v-model="newGroup"
          class="input"
          placeholder="Группа"
          style="min-width:180px;"
          list="groupsDatalistTab"
        />
        <datalist id="groupsDatalistTab">
          <option v-for="g in proj.allGroups" :key="g" :value="g" />
        </datalist>
        <input v-model="newName" class="input" placeholder="Проект" style="min-width:240px;" />
        <input
          v-model="newBudget"
          class="input mono"
          type="number"
          min="0"
          step="0.01"
          placeholder="Бюджет"
          style="min-width:140px;"
        />
        <button class="btn primary" @click="addProject">Добавить</button>
      </div>
      <div class="controls">
        <button class="btn" @click="() => {}">Пересчитать</button>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:7%">Оплачен</th>
          <th style="width:8%">Группа</th>
          <th style="width:28%">Проект</th>
          <th class="nowrap" style="width:10%">Часы 1 / 1,5</th>
          <th class="nowrap" style="width:10%">Бюджет</th>
          <th class="nowrap" style="width:10%">Ставка</th>
          <th style="width:20%">Комментарий</th>
          <th style="width:4%"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="visibleProjects.length === 0">
          <td colspan="8" class="muted">
            {{ showArchived ? 'Проектов нет.' : 'Нет неархивных проектов. Нажми «Показать архивные».' }}
          </td>
        </tr>
        <tr
          v-for="p in visibleProjects"
          :key="p.id"
          :class="{ paid: p.paid }"
        >
          <!-- Paid checkbox -->
          <td>
            <input
              v-model="p.paid"
              class="ck"
              type="checkbox"
              @change="savePaidToggle(p)"
            />
          </td>

          <!-- Group -->
          <td>
            <span class="tag" style="cursor:pointer" title="Клик: изменить группу" @click="openGroupModal(p.id)">
              {{ (p.group || '').trim() || '—' }}
            </span>
          </td>

          <!-- Name + color dot -->
          <td class="nameCol">
            <div style="display:flex;align-items:flex-start;gap:8px;">
              <span
                class="dot"
                :style="{ background: dotColor(p), marginTop:'4px', cursor:'pointer' }"
                title="Клик: изменить цвет"
                @click="openColorPicker($event, p)"
              ></span>
              <input
                class="input"
                type="text"
                :value="p.name"
                style="width:100%"
                @keydown.enter="e => e.target.blur()"
                @change="e => saveNameChange(p, e.target)"
              />
            </div>
          </td>

          <!-- Hours -->
          <td class="mono">
            {{ hoursFor(p.id).real.toFixed(2) }} / {{ hoursFor(p.id).weighted.toFixed(2) }}
          </td>

          <!-- Budget -->
          <td>
            <input
              class="input mono"
              type="number"
              min="0"
              step="0.01"
              :value="p.budget.toFixed(2)"
              style="width:120px;"
              @change="e => saveBudget(p, e.target.value)"
            />
          </td>

          <!-- Rate -->
          <td class="mono">{{ rateFor(p) === null ? '—' : rateFor(p).toFixed(2) }}</td>

          <!-- Comment -->
          <td>
            <textarea
              v-model="p.comment"
              class="textarea"
              placeholder="Комментарий..."
              @input="saveComment(p)"
            ></textarea>
          </td>

          <!-- Delete -->
          <td>
            <button class="btn danger icon" title="Удалить проект" @click="removeProject(p)">✕</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="footerRow">
      <button class="btn" @click="showArchived = !showArchived">
        {{ showArchived ? 'Скрыть архивные' : 'Показать архивные' }}
      </button>
    </div>

    <div class="hint">
      Проекты сортируются по времени добавления (новые сверху). Архивные по умолчанию скрыты.
    </div>

    <GroupModal ref="groupModal" />
    <ColorPicker ref="colorPicker" @pick="onColorPick" />
  </div>
</template>
