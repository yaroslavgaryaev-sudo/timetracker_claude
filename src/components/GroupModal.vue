<script setup>
import { useI18n } from '../i18n/index.js'
import { ref } from 'vue'
import { useProjectsStore } from '../stores/projects'
import { useToastStore } from '../stores/toast'
import { onMounted, onUnmounted } from 'vue'

const proj = useProjectsStore()
const toast = useToastStore()
const visible = ref(false)
const projectId = ref(null)
const groupValue = ref('')
const projectName = ref('')
const { t } = useI18n()

function open(pid) {
  const p = proj.byId(pid)
  if (!p) return
  projectId.value = pid
  projectName.value = p.name
  groupValue.value = (p.group || '').trim()
  visible.value = true
}

function close() { visible.value = false }

function save() {
  const p = proj.byId(projectId.value)
  if (!p) return
  const prev = p.group
  p.group = (groupValue.value || '').trim()
  proj.localUpdate({ id: p.id, group: p.group })
  close() // закрываем мгновенно
  proj.save(p).catch(e => {
    console.error(e)
    toast.error(t('errors.saveGroup'))
    p.group = prev
    proj.localUpdate({ id: p.id, group: prev })
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
            <span class="m-icon">⊞</span>
            <span class="m-title">{{ t('groups.modalTitle') }}</span>
          </div>
          <button class="m-close" title="Закрыть (Esc)" @click="close">✕</button>
        </div>

        <div class="m-meta">{{ projectName }}</div>

        <div class="m-body">
          <div class="m-field">
            <label class="m-label">Выбери из существующих или введи новую</label>
            <input
              v-model="groupValue"
              class="m-input"
              placeholder="Группа (например: Клиент А)"
              list="groupsDatalistModal"
              @keydown.enter="save"
            />
            <datalist id="groupsDatalistModal">
              <option v-for="g in proj.allGroups" :key="g" :value="g" />
            </datalist>
          </div>
        </div>

        <div class="m-foot">
          <div style="flex:1"></div>
          <button class="m-btn" @click="close">{{ t('btn.cancel') }}</button>
          <button class="m-btn m-btn-primary" @click="save">
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
  background: var(--backdrop); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 18px;
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

.m-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-modal);
}
.m-head-left { display: flex; align-items: center; gap: 10px; }
.m-icon { font-size: 16px; color: var(--accent); opacity: .8; }
.m-title {
  font-family: ui-monospace, monospace;
  font-size: 13px; font-weight: 700;
  letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent-text);
}
.m-close {
  background: transparent; border: 1px solid var(--border-strong);
  color: var(--text-dim); width: 28px; height: 28px; border-radius: 8px;
  cursor: pointer; font-size: 12px;
  display: flex; align-items: center; justify-content: center;
  transition: background .12s, color .12s, border-color .12s; font-family: inherit;
}
.m-close:hover { background: rgba(255,100,100,0.12); border-color: rgba(255,100,100,0.35); color: var(--danger); }

.m-meta {
  padding: 9px 18px;
  font-size: 12px; color: var(--text-dim);
  border-bottom: 1px solid var(--surface-hover);
  background: var(--bg);
  font-style: italic;
}

.m-body { padding: 20px 18px; display: flex; flex-direction: column; gap: 12px; background: var(--surface-modal); }

.m-field { display: flex; flex-direction: column; gap: 7px; }
.m-label {
  font-size: 11px; font-weight: 600; letter-spacing: 1px;
  text-transform: uppercase; color: var(--text-dim);
}
.m-input {
  background: var(--surface-input2);
  border: 1px solid var(--border-strong);
  color: var(--text); padding: 9px 12px;
  border-radius: 10px; font-size: 13px; font-family: inherit; outline: none;
  transition: border-color .12s;
}
.m-input:focus { border-color: var(--blue-border); }
.m-input::placeholder { color: var(--text-muted); }


.m-foot {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-modal);
}
.m-btn {
  background: var(--surface-hover); border: 1px solid var(--border-strong);
  color: var(--text-secondary); padding: 8px 16px; border-radius: 10px;
  cursor: pointer; font-size: 13px; font-weight: 600; font-family: inherit;
  transition: background .12s, border-color .12s, color .12s;
}
.m-btn:hover { background: var(--border); color: #e8ecf7; }
.m-btn:disabled { opacity: .45; cursor: not-allowed; }
.m-btn-primary { background: var(--accent-dim); border-color: var(--accent-border); color: var(--accent-text); }
.m-btn-primary:hover { background: var(--accent-dim); }
</style>
