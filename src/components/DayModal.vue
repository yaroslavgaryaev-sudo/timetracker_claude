<script setup>
import { ref, computed } from 'vue'
import { useCalendarStore } from '../stores/calendar'
import { useAuthStore } from '../stores/auth'
import { fmtDayHeader, fromISODate, isWeekendISO } from '../utils'
import { onMounted, onUnmounted } from 'vue'

const cal = useCalendarStore()
const auth = useAuthStore()

const visible = ref(false)
const dateISO = ref('')
const saving = ref(false)

const weekendDefault = computed(() => isWeekendISO(dateISO.value))
const effectivePremium = computed(() => dateISO.value ? cal.isPremiumWholeDay(dateISO.value) : false)
const override = computed(() => dateISO.value ? cal.getOverride(dateISO.value) : null)

const metaText = computed(() => {
  if (!dateISO.value) return ''
  return `${dateISO.value} • ${fmtDayHeader(fromISODate(dateISO.value))}`
})

const explainText = computed(() => {
  const base = weekendDefault.value ? 'По умолчанию: выходной (сб/вс)' : 'По умолчанию: рабочий'
  const cur = effectivePremium.value
    ? 'Выходной (x1.5 весь день)'
    : 'Рабочий (x1.5 только до 10:00 и с 19:00)'
  return `${base}. Сейчас: ${cur}.`
})

const toggleLabel = computed(() => effectivePremium.value ? 'Сделать рабочим' : 'Сделать выходным')
const hasOverride = computed(() => override.value !== null)

const hintText = computed(() =>
  hasOverride.value
    ? 'Сбросить — вернёт поведение «по умолчанию».'
    : 'Для этого дня нет переопределения.'
)

function open(d) {
  if (!auth.isAuthed) { alert('Сначала войди по e-mail.'); return }
  dateISO.value = d
  visible.value = true
}

function close() { visible.value = false }

async function toggle() {
  saving.value = true
  const d = dateISO.value
  const desired = !effectivePremium.value
  const defaultPremium = isWeekendISO(d)
  try {
    if (desired === defaultPremium) await cal.deleteDayOverride(d)
    else await cal.upsertDayOverride(d, desired)
    await cal.loadWeek()
    close()
  } catch (e) {
    console.error(e)
    alert('Не получилось сохранить изменение дня.')
  } finally {
    saving.value = false
  }
}

async function reset() {
  saving.value = true
  try {
    await cal.deleteDayOverride(dateISO.value)
    await cal.loadWeek()
    close()
  } catch (e) {
    console.error(e)
    alert('Не получилось сбросить день.')
  } finally {
    saving.value = false
  }
}

function onKey(e) { if (e.key === 'Escape') close() }
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))

defineExpose({ open })
</script>

<template>
  <div class="modalBack" :class="{ open: visible }" @click.self="close">
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modalHead">
        <div class="modalTitle">День: Рабочий / Выходной</div>
        <button class="btn ghost" title="Закрыть (Esc)" @click="close">✕</button>
      </div>
      <div class="modalBody">
        <div class="small muted">{{ metaText }}</div>
        <div style="height:10px"></div>
        <div class="pillNote">{{ explainText }}</div>
        <div class="hint" style="margin-top:10px;">{{ hintText }}</div>
      </div>
      <div class="modalFoot">
        <button class="btn" :disabled="!hasOverride || saving" @click="reset">Сбросить</button>
        <button class="btn primary" :disabled="saving" @click="toggle">{{ toggleLabel }}</button>
      </div>
    </div>
  </div>
</template>
