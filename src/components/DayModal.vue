<script setup>
import { useI18n } from '../i18n/index.js'
import { ref, computed } from 'vue'
import { useCalendarStore } from '../stores/calendar'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { fmtDayHeader, fromISODate, isWeekendISO } from '../utils'
import { onMounted, onUnmounted } from 'vue'

const cal = useCalendarStore()
const auth = useAuthStore()
const toast = useToastStore()

const visible = ref(false)
const dateISO = ref('')

const weekendDefault = computed(() => isWeekendISO(dateISO.value))
const effectivePremium = computed(() => dateISO.value ? cal.isPremiumWholeDay(dateISO.value) : false)
const override = computed(() => dateISO.value ? cal.getOverride(dateISO.value) : null)
const { t } = useI18n()
const hasOverride = computed(() => override.value !== null)

const metaText = computed(() => {
  if (!dateISO.value) return ''
  return `${dateISO.value} · ${fmtDayHeader(fromISODate(dateISO.value))}`
})

const statusLabel = computed(() => effectivePremium.value ? t('day.dayOff') : t('day.workDay'))
const statusColor = computed(() => effectivePremium.value ? '#ffb86a' : '#66ffa6')

const baseLabel = computed(() => weekendDefault.value ? t('day.defaultOff') : t('day.defaultWork'))
const toggleLabel = computed(() => effectivePremium.value ? t('day.makeWork') : t('day.makeOff'))

function open(d) {
  if (!auth.isAuthed) { toast.warn('Сначала войди по e-mail.'); return }
  dateISO.value = d
  visible.value = true
}

function close() { visible.value = false }

function toggle() {
  const d = dateISO.value
  const desired = !effectivePremium.value
  const defaultPremium = isWeekendISO(d)
  // Оптимистичное обновление локального state
  if (desired === defaultPremium) {
    delete cal.dayOverrides.value[d]
  } else {
    cal.dayOverrides.value[d] = desired
  }
  close()
  // Сохраняем в фоне
  const op = desired === defaultPremium ? cal.deleteDayOverride(d) : cal.upsertDayOverride(d, desired)
  op.catch(e => {
    console.error(e)
    toast.error(t('day.saveError'))
    // Откат — перезагружаем переопределения текущей недели
    cal.loadWeek().catch(console.error)
  })
}

function reset() {
  const d = dateISO.value
  delete cal.dayOverrides.value[d]
  close()
  cal.deleteDayOverride(d).catch(e => {
    console.error(e)
    toast.error(t('day.resetError'))
    cal.loadWeek().catch(console.error)
  })
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

        <div class="m-head">
          <div class="m-head-left">
            <span class="m-icon">◈</span>
            <span class="m-title">{{ t('day.dayOff') }} / {{ t('day.workDay') }}</span>
          </div>
          <button class="m-close" title="Закрыть (Esc)" @click="close">✕</button>
        </div>

        <div class="m-meta">{{ metaText }}</div>

        <div class="m-body">
          <!-- Status card -->
          <div class="dm-status-card">
            <div class="dm-status-row">
              <span class="dm-status-dot" :style="{ background: statusColor }"></span>
              <span class="dm-status-label" :style="{ color: statusColor }">{{ statusLabel }}</span>
              <span class="dm-status-mult">{{ effectivePremium ? t('day.premiumAllDay') : t('day.premiumHours') }}</span>
            </div>
            <div class="dm-base-label">{{ baseLabel }}</div>
            <div v-if="hasOverride" class="dm-override-badge">переопределён вручную</div>
          </div>
        </div>

        <div class="m-foot">
          <button class="m-btn m-btn-ghost" :disabled="!hasOverride" @click="reset">{{ t('btn.reset') }}</button>
          <div style="flex:1"></div>
          <button class="m-btn" @click="close">{{ t('btn.cancel') }}</button>
          <button class="m-btn m-btn-primary" @click="toggle">
            {{ toggleLabel }}
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
  width: min(400px, 100%);
  background: var(--surface-modal);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: 0 24px 64px var(--backdrop), 0 0 0 1px var(--surface-raised) inset;
  overflow: hidden;
  animation: slideUp .18s ease;
}
@keyframes slideUp { from { transform: translateY(10px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

.m-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-raised);
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

.m-meta {
  padding: 9px 18px;
  font-family: ui-monospace, monospace;
  font-size: 11px; letter-spacing: .5px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--surface-hover);
  background: var(--surface-dark);
}

.m-body { padding: 20px 18px; }

.dm-status-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex; flex-direction: column; gap: 8px;
}
.dm-status-row { display: flex; align-items: center; gap: 10px; }
.dm-status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.dm-status-label { font-size: 15px; font-weight: 700; }
.dm-status-mult {
  font-family: ui-monospace, monospace;
  font-size: 11px; color: var(--text-dim);
  margin-left: auto;
}
.dm-base-label { font-size: 12px; color: var(--text-dim); padding-left: 20px; }
.dm-override-badge {
  display: inline-flex; align-self: flex-start; margin-left: 20px;
  font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
  color: var(--accent-muted);
  background: var(--accent-faint);
  border: 1px solid var(--accent-dim);
  border-radius: 999px;
  padding: 2px 8px;
}

.m-foot {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-dark);
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
.m-btn-primary { background: var(--accent-dim); border-color: var(--accent-border); color: var(--accent-text); }
.m-btn-primary:hover { background: var(--accent-dim); }
.m-btn-ghost { background: transparent; border-color: var(--border-strong); color: var(--text-dim); }
.m-btn-ghost:hover:not(:disabled) { background: var(--surface-hover); color: rgba(255,255,255,0.7); }
</style>
