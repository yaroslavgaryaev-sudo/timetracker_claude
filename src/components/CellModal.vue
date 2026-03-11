<script setup>
import { ref, computed } from 'vue'
import { useCalendarStore } from '../stores/calendar'
import { useProjectsStore } from '../stores/projects'
import { useAuthStore } from '../stores/auth'
import { slotToLabel, entryKey } from '../utils'

const cal = useCalendarStore()
const proj = useProjectsStore()
const auth = useAuthStore()

const visible = ref(false)
const dateISO = ref('')
const slot = ref(0)
const task1 = ref('')
const task2 = ref('')
const isHalf = ref(false)
const saving = ref(false)

const selectable = computed(() => proj.list.filter(p => !p.archived))

const meta = computed(() => {
  if (!dateISO.value) return ''
  const mult = cal.slotMultiplier(dateISO.value, slot.value)
  const label = task2.value
    ? '2 задачи по 0.25ч'
    : (isHalf.value ? '1 задача 0.25ч (пол-ячейки)' : '1 задача 0.5ч')
  return `${dateISO.value} • ${slotToLabel(slot.value)} – ${slotToLabel(slot.value + 1)} • x${mult} • ${label}`
})

function open(d, s) {
  if (!auth.isAuthed) {
    alert('Сначала войди по e-mail, чтобы сохранять данные в базе.')
    return
  }
  dateISO.value = d
  slot.value = s

  const tasks = cal.getCell(d, s)
  const k = entryKey(d, s)
  const half = !!cal.cellHalf[k] && tasks.length === 1

  task1.value = tasks[0] ?? (selectable.value[0]?.id ?? '')
  task2.value = tasks[1] ?? ''
  isHalf.value = tasks.length === 2 ? false : half

  visible.value = true
}

function close() { visible.value = false }

function onHalfChange() {
  if (isHalf.value) task2.value = ''
}

function onTask2Change() {
  if (task2.value) isHalf.value = false
}

async function save() {
  saving.value = true
  const next = []
  if (task1.value) next.push(task1.value)
  if (!isHalf.value && task2.value) next.push(task2.value)
  try {
    await cal.saveCell(dateISO.value, slot.value, next, isHalf.value)
    close()
  } catch (e) {
    console.error(e)
    alert('Ошибка сохранения ячейки.')
  } finally {
    saving.value = false
  }
}

async function clear() {
  saving.value = true
  try {
    await cal.saveCell(dateISO.value, slot.value, [], false)
    close()
  } catch (e) {
    console.error(e)
    alert('Ошибка очистки ячейки.')
  } finally {
    saving.value = false
  }
}

// Esc
import { onMounted, onUnmounted } from 'vue'
function onKey(e) { if (e.key === 'Escape') close() }
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))

defineExpose({ open })
</script>

<template>
  <div class="modalBack" :class="{ open: visible }" @click.self="close">
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modalHead">
        <div class="modalTitle">Задачи в ячейке</div>
        <button class="btn ghost" title="Закрыть (Esc)" @click="close">✕</button>
      </div>

      <div class="modalBody">
        <div class="small muted">{{ meta }}</div>
        <div style="height:10px"></div>

        <div v-if="selectable.length === 0" class="hint">
          Нет доступных проектов. Открой «Проекты» и сними «Оплачено».
        </div>

        <div v-else class="twoCols">
          <div>
            <label class="small muted">Задача 1:</label>
            <select v-model="task1" class="select" style="width:100%">
              <option v-for="p in selectable" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div>
            <label class="small muted">Задача 2 (опционально):</label>
            <select
              v-model="task2"
              class="select"
              style="width:100%"
              :disabled="isHalf"
              @change="onTask2Change"
            >
              <option value="">— нет —</option>
              <option v-for="p in selectable" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div style="margin-top:10px; display:flex; align-items:center; gap:10px;">
            <input
              id="halfCellCk"
              v-model="isHalf"
              type="checkbox"
              @change="onHalfChange"
            />
            <label for="halfCellCk" class="small muted">
              Пол-ячейки (0,25ч). Вторая задача будет недоступна.
            </label>
          </div>
        </div>

        <div class="hint">Можно выбрать до 2 задач в одной ячейке.</div>
      </div>

      <div class="modalFoot">
        <button class="btn" :disabled="saving" @click="clear">Очистить</button>
        <button
          class="btn primary"
          :disabled="saving || selectable.length === 0"
          @click="save"
        >Сохранить</button>
      </div>
    </div>
  </div>
</template>
