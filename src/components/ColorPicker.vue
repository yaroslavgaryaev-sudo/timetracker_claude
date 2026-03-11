<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ALLOWED_PROJECT_COLORS } from '../utils'

const emit = defineEmits(['pick'])

const visible = ref(false)
const posX = ref(0)
const posY = ref(0)

function open(x, y) {
  posX.value = Math.max(8, Math.min(window.innerWidth - 220, x))
  posY.value = Math.max(8, Math.min(window.innerHeight - 120, y))
  visible.value = true
}

function pick(color) {
  visible.value = false
  emit('pick', color)
}

function onKey(e) { if (e.key === 'Escape') visible.value = false }
function onDoc(e) {
  // Close if clicking outside — handled by @click.self on backdrop isn't ideal
  // The picker is positioned fixed, so we use this approach
}

onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="colorPickerWrap"
      :style="{ left: posX + 'px', top: posY + 'px' }"
    >
      <div class="muted" style="margin-bottom:8px; font-size:12px;">Цвет проекта:</div>
      <div class="colorGrid">
        <button
          v-for="c in ALLOWED_PROJECT_COLORS"
          :key="c"
          class="colorSwatch"
          :style="{ background: c }"
          :title="c"
          @click="pick(c)"
        ></button>
      </div>
      <div class="muted" style="margin-top:8px; font-size:12px;">Esc или клик вне — закрыть</div>
    </div>
  </Teleport>
  <!-- Backdrop -->
  <Teleport v-if="visible" to="body">
    <div
      style="position:fixed;inset:0;z-index:9998;"
      @click="visible = false"
    ></div>
  </Teleport>
</template>

<style scoped>
.colorPickerWrap {
  position: fixed;
  z-index: 9999;
  padding: 10px;
  border-radius: 12px;
  background: rgba(20,20,24,0.98);
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 10px 30px rgba(0,0,0,0.45);
}
.colorGrid {
  display: grid;
  grid-template-columns: repeat(6, 26px);
  gap: 8px;
}
.colorSwatch {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.18);
  cursor: pointer;
}
.colorSwatch:hover { opacity: 0.8; }
</style>
