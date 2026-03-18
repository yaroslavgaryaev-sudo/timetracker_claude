<script setup>
import { useI18n } from '../i18n/index.js'
import { ref, onMounted, onUnmounted } from 'vue'
import { PALETTE_KEYS, colorKeyToHex } from '../utils'

const emit = defineEmits(['pick'])
const visible = ref(false)
const posX = ref(0)
const posY = ref(0)

function open(x, y) {
  posX.value = Math.max(8, Math.min(window.innerWidth - 230, x))
  posY.value = Math.max(8, Math.min(window.innerHeight - 160, y))
  visible.value = true
}

function pick(key) { visible.value = false; emit('pick', key) }
function onKey(e) { if (e.key === 'Escape') visible.value = false }
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" style="position:fixed;inset:0;z-index:9998;" @click="visible = false"></div>
    <div
      v-if="visible"
      class="cp-wrap"
      :style="{ left: posX + 'px', top: posY + 'px' }"
    >
      <div class="cp-label">{{ t('color.title') }}</div>
      <div class="cp-grid">
        <button
          v-for="key in PALETTE_KEYS"
          :key="key"
          class="cp-swatch"
          :style="{ background: colorKeyToHex(key) }"
          :title="key"
          @click.stop="pick(key)"
        ></button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cp-wrap {
  position: fixed;
  z-index: 9999;
  padding: 12px 14px;
  border-radius: 14px;
  background: #141414;
  border: 1px solid rgba(255,255,255,0.11);
  box-shadow: 0 16px 40px var(--overlay-bg), 0 0 0 1px var(--surface-raised) inset;
  animation: popIn .14s ease;
}
@keyframes popIn { from { transform: scale(.94); opacity: 0 } to { transform: scale(1); opacity: 1 } }

.cp-label {
  font-family: ui-monospace, monospace;
  font-size: 10px; font-weight: 700; letter-spacing: 1.5px;
  text-transform: uppercase; color: rgba(232,213,183,0.6);
  margin-bottom: 10px;
}
.cp-grid {
  display: grid;
  grid-template-columns: repeat(6, 28px);
  gap: 7px;
}
.cp-swatch {
  width: 28px; height: 28px; border-radius: 9px;
  border: 1.5px solid rgba(255,255,255,0.15);
  cursor: pointer;
  transition: transform .12s, box-shadow .12s;
}
.cp-swatch:hover { transform: scale(1.2); box-shadow: 0 0 8px var(--text-faint); }
</style>
