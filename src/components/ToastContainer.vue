<script setup>
import { useToastStore } from '../stores/toast'
const toast = useToastStore()
</script>

<template>
  <Teleport to="body">
    <div class="tc-wrap">
      <TransitionGroup name="tc-toast" tag="div" class="tc-list">
        <div
          v-for="t in toast.toasts"
          :key="t.id"
          class="tc-item"
          :class="`tc-${t.type}`"
          @click="toast.remove(t.id)"
        >
          <span class="tc-icon">
            <span v-if="t.type === 'error'">✕</span>
            <span v-else-if="t.type === 'success'">✓</span>
            <span v-else>!</span>
          </span>
          <span class="tc-msg">{{ t.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.tc-wrap {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.tc-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.tc-item {
  pointer-events: all;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  max-width: 420px;
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  border: 1px solid;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tc-error {
  background: rgba(233, 0, 0, 0.18);
  border-color: rgba(233, 0, 0, 0.45);
  color: #ff7070;
}

.tc-success {
  background: rgba(0, 186, 115, 0.15);
  border-color: rgba(0, 186, 115, 0.4);
  color: #4de0a8;
}

.tc-warn {
  background: rgba(255, 188, 0, 0.14);
  border-color: rgba(255, 188, 0, 0.4);
  color: #ffcc44;
}

.tc-icon {
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid currentColor;
  opacity: 0.85;
}

.tc-msg {
  line-height: 1.4;
  white-space: normal;
}

/* Анимация */
.tc-toast-enter-active { transition: all 0.2s ease; }
.tc-toast-leave-active { transition: all 0.18s ease; }
.tc-toast-enter-from   { opacity: 0; transform: translateY(10px) scale(0.96); }
.tc-toast-leave-to     { opacity: 0; transform: translateY(6px) scale(0.97); }
</style>
