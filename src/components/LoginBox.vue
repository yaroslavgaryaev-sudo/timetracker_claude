<script setup>
import { useI18n } from '../i18n/index.js'
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'

const auth = useAuthStore()
const toast = useToastStore()
const { t } = useI18n()
const email = ref('')
const hint = ref('')
const loading = ref(false)

async function sendLink() {
  const e = email.value.trim()
  if (!e) { toast.warn('Введи e-mail.'); return }
  loading.value = true
  hint.value = t('btn.sending')
  try {
    const redirectTo = window.location.origin + window.location.pathname
    await auth.sendMagicLink(e, redirectTo)
    hint.value = t('auth.linkSent')
  } catch (err) {
    console.error(err)
    hint.value = t('auth.errorSend')
    toast.error(t('auth.errorSendPrefix') + (err?.message || t('auth.unknownError')))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="lb-wrap">
    <div class="lb-card">
      <div class="lb-icon">⏱</div>
      <div class="lb-title">Time Tracker</div>
      <div class="lb-sub">Войди по e-mail, чтобы сохранять данные</div>

      <div class="lb-form">
        <input
          v-model="email"
          class="lb-input"
          type="email"
          placeholder="your@email.com"
          @keydown.enter="sendLink"
        />
        <button class="lb-btn" :disabled="loading" @click="sendLink">
          {{ loading ? '…' : 'Отправить ссылку' }}
        </button>
      </div>

      <div v-if="hint" class="lb-hint">{{ hint }}</div>
      <div v-else class="lb-hint lb-hint-muted">{{ t('auth.spamHint') }}</div>
    </div>
  </div>
</template>

<style scoped>
.lb-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
}
.lb-card {
  width: min(380px, 100%);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 18px;
  padding: 32px 28px 28px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  text-align: center;
}
.lb-icon { font-size: 32px; line-height: 1; margin-bottom: 4px; }
.lb-title {
  font-family: ui-monospace, monospace;
  font-size: 16px; font-weight: 700;
  letter-spacing: 3px; text-transform: uppercase;
  color: var(--accent-text);
}
.lb-sub { font-size: 13px; color: var(--text-dim); margin-bottom: 8px; }

.lb-form {
  width: 100%;
  display: flex; flex-direction: column; gap: 8px;
  margin-top: 4px;
}
.lb-input {
  width: 100%;
  background: var(--surface-hover);
  border: 1px solid var(--border-strong);
  color: #e8ecf7; padding: 11px 14px;
  border-radius: 12px; font-size: 14px; font-family: inherit; outline: none;
  box-sizing: border-box;
  transition: border-color .12s, background .12s;
  text-align: center;
}
.lb-input:focus { border-color: var(--blue-border); background: var(--blue-dim); }
.lb-input::placeholder { color: var(--text-faint); }

.lb-btn {
  width: 100%;
  background: var(--accent-dim);
  border: 1px solid var(--accent-border);
  color: #e8ecf7; padding: 11px 14px;
  border-radius: 12px; font-size: 14px; font-weight: 700;
  font-family: inherit; cursor: pointer;
  transition: background .12s, border-color .12s;
}
.lb-btn:hover:not(:disabled) { background: var(--accent-dim); }
.lb-btn:disabled { opacity: .5; cursor: not-allowed; }

.lb-hint {
  font-size: 12px; color: rgba(201,169,110,0.9);
  margin-top: 4px; line-height: 1.5;
}
.lb-hint-muted { color: var(--text-faint); }
</style>
