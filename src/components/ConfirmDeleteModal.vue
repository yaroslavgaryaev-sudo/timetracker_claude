<script setup>
import { useI18n } from '../i18n/index.js'
import { ref, onMounted, onUnmounted } from 'vue'

const { t } = useI18n()

const visible = ref(false)
const title = ref('')
const entityName = ref('')
const bodyPrefix = ref('')
const bodySuffix = ref('?')
const subText = ref('')
const confirmLabel = ref('')
const isDanger = ref(true)

let resolveFn = null

// open(name) — старый режим (удаление проекта)
// open(name, { title, bodyPrefix, bodySuffix, subtext, confirmLabel, danger }) — расширенный
function open(name, opts = {}) {
  title.value        = opts.title        ?? t('confirm.deleteProject')
  bodyPrefix.value   = opts.bodyPrefix   ?? t('confirm.deleteProjectBody')
  bodySuffix.value   = opts.bodySuffix   ?? '?'
  subText.value      = opts.subtext      ?? t('confirm.deleteProjectSub')
  confirmLabel.value = opts.confirmLabel ?? t('btn.delete')
  isDanger.value     = opts.danger       ?? true
  entityName.value   = name
  visible.value = true
  return new Promise(resolve => { resolveFn = resolve })
}

function confirm() {
  visible.value = false
  resolveFn?.(true)
}

function cancel() {
  visible.value = false
  resolveFn?.(false)
}

function onKey(e) {
  if (!visible.value) return
  if (e.key === 'Escape') cancel()
  if (e.key === 'Enter') confirm()
}

onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="m-backdrop" @click.self="cancel">
      <div class="m-box" role="dialog" aria-modal="true">

        <!-- Head -->
        <div class="m-head">
          <div class="m-head-left">
            <span class="m-icon" :class="isDanger ? 'm-icon-danger' : 'm-icon-warn'">{{ isDanger ? '⚠' : '📦' }}</span>
            <span class="m-title">{{ title }}</span>
          </div>
          <button class="m-close" title="Закрыть (Esc)" @click="cancel">✕</button>
        </div>

        <!-- Body -->
        <div class="m-body">
          <p class="m-text">
            {{ bodyPrefix }} <span class="m-project-name">«{{ entityName }}»</span>{{ bodySuffix }}
          </p>
          <p v-if="subText" class="m-subtext">{{ subText }}</p>
        </div>

        <!-- Foot -->
        <div class="m-foot">
          <div style="flex:1"></div>
          <button class="m-btn" @click="cancel">{{ t('btn.cancel') }}</button>
          <button class="m-btn" :class="isDanger ? 'm-btn-danger' : 'm-btn-primary'" @click="confirm">
            {{ confirmLabel }}
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
  width: min(420px, 100%);
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
.m-icon { font-size: 14px; opacity: .85; }
.m-icon-danger { color: var(--danger); }
.m-icon-warn   { color: var(--accent); }
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
.m-body {
  padding: 22px 22px 20px;
  background: var(--surface-modal);
  display: flex; flex-direction: column; gap: 8px;
}
.m-text {
  font-size: 14px;
  color: var(--text);
  margin: 0;
  line-height: 1.5;
}
.m-project-name {
  color: var(--accent-text);
  font-weight: 600;
}
.m-subtext {
  font-size: 12px;
  color: var(--text-dim);
  margin: 0;
  line-height: 1.5;
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

.m-btn-danger {
  background: var(--danger-dim);
  border-color: var(--danger-border);
  color: var(--danger);
}
.m-btn-danger:hover {
  background: var(--danger-dim);
  border-color: var(--danger-border);
  color: var(--danger);
}
.m-btn-primary {
  background: var(--accent-dim);
  border-color: var(--accent-border);
  color: var(--accent-text);
}
.m-btn-primary:hover {
  background: var(--accent-dim);
  border-color: var(--accent-border);
}
</style>
