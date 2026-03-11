<script setup>
import { ref } from 'vue'
import { useProjectsStore } from '../stores/projects'
import { onMounted, onUnmounted } from 'vue'

const proj = useProjectsStore()

const visible = ref(false)
const projectId = ref(null)
const groupValue = ref('')
const saving = ref(false)
const projectName = ref('')

function open(pid) {
  const p = proj.byId(pid)
  if (!p) return
  projectId.value = pid
  projectName.value = p.name
  groupValue.value = (p.group || '').trim()
  visible.value = true
}

function close() { visible.value = false }

async function save() {
  const p = proj.byId(projectId.value)
  if (!p) return
  saving.value = true
  p.group = (groupValue.value || '').trim()
  try {
    await proj.save(p)
    await proj.fetch()
    close()
  } catch (e) {
    console.error(e)
    alert('Ошибка сохранения группы.')
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
        <div class="modalTitle">Группа проекта</div>
        <button class="btn ghost" title="Закрыть (Esc)" @click="close">✕</button>
      </div>
      <div class="modalBody">
        <div class="small muted">Проект: {{ projectName }}</div>
        <div style="height:10px"></div>
        <label class="small muted">Выбери из существующих или введи новую:</label>
        <input
          v-model="groupValue"
          class="input"
          placeholder="Группа (например: Клиент А)"
          style="width:100%; margin-top:8px;"
          list="groupsDatalistModal"
          @keydown.enter="save"
        />
        <datalist id="groupsDatalistModal">
          <option v-for="g in proj.allGroups" :key="g" :value="g" />
        </datalist>
        <div class="hint">Если введёшь новую группу — она появится в списке автоматически.</div>
      </div>
      <div class="modalFoot">
        <button class="btn primary" :disabled="saving" @click="save">Сохранить</button>
      </div>
    </div>
  </div>
</template>
