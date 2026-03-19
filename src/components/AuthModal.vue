<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { useI18n } from '../i18n/index.js'
import { onMounted, onUnmounted } from 'vue'

const auth = useAuthStore()
const toast = useToastStore()
const { t } = useI18n()

const email = ref('')
const loading = ref(false)
const loadingProvider = ref('')
const hint = ref('')
const emailSent = ref(false)

async function sendLink() {
  const e = email.value.trim()
  if (!e) { toast.warn('Введи e-mail.'); return }
  loading.value = true
  hint.value = ''
  try {
    const redirectTo = window.location.origin + window.location.pathname
    await auth.sendMagicLink(e, redirectTo)
    emailSent.value = true
    hint.value = t('auth.linkSent')
  } catch (err) {
    console.error(err)
    toast.error(t('auth.errorSendPrefix') + (err?.message || t('auth.unknownError')))
  } finally {
    loading.value = false
  }
}

async function signInWith(provider) {
  loadingProvider.value = provider
  try {
    const redirectTo = window.location.origin + window.location.pathname
    await auth.signInWithProvider(provider, redirectTo)
  } catch (err) {
    console.error(err)
    toast.error('Ошибка входа через ' + provider)
    loadingProvider.value = ''
  }
}

function onKey(e) { if (e.key === 'Escape') {} }
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="!auth.isAuthed" class="am-backdrop">
      <div class="am-box" role="dialog" aria-modal="true">

        <!-- Logo -->
        <div class="am-logo">
          <span class="am-logo-icon">⏱</span>
          <span class="am-logo-title">Time Tracker</span>
        </div>
        <p class="am-subtitle">Войди, чтобы сохранять данные</p>

        <template v-if="!emailSent">
          <!-- OAuth buttons -->
          <div class="am-oauth">
            <button
              class="am-oauth-btn"
              :disabled="!!loadingProvider"
              @click="signInWith('google')"
            >
              <svg class="am-oauth-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>{{ loadingProvider === 'google' ? 'Загрузка…' : 'Войти через Google' }}</span>
            </button>

            <button
              class="am-oauth-btn"
              :disabled="!!loadingProvider"
              @click="signInWith('apple')"
            >
              <svg class="am-oauth-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.55-1.31 3.09-2.53 3.99zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" fill="currentColor"/>
              </svg>
              <span>{{ loadingProvider === 'apple' ? 'Загрузка…' : 'Войти через Apple' }}</span>
            </button>
          </div>

          <div class="am-divider">
            <span class="am-divider-line"></span>
            <span class="am-divider-text">или по e-mail</span>
            <span class="am-divider-line"></span>
          </div>

          <!-- Email form -->
          <div class="am-form">
            <input
              v-model="email"
              class="am-input"
              type="email"
              placeholder="your@email.com"
              :disabled="loading"
              @keydown.enter="sendLink"
            />
            <button class="am-btn-email" :disabled="loading" @click="sendLink">
              {{ loading ? 'Отправляю…' : 'Получить ссылку' }}
            </button>
          </div>

          <p class="am-hint-muted">Мы пришлём письмо со ссылкой. Проверь Spam если не приходит.</p>
        </template>

        <!-- Sent state -->
        <template v-else>
          <div class="am-sent">
            <div class="am-sent-icon">✉</div>
            <p class="am-sent-title">Ссылка отправлена!</p>
            <p class="am-sent-text">Открой письмо на <strong>{{ email }}</strong> и нажми на ссылку для входа.</p>
            <button class="am-btn-back" @click="emailSent = false; email = ''">← Назад</button>
          </div>
        </template>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.am-backdrop {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: var(--backdrop);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: amFadeIn .2s ease;
}
@keyframes amFadeIn { from { opacity: 0 } to { opacity: 1 } }

.am-box {
  width: min(420px, 100%);
  background: var(--surface-modal);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 36px 32px 32px;
  box-shadow: 0 32px 80px rgba(0,0,0,0.5);
  animation: amSlideUp .22s ease;
  display: flex;
  flex-direction: column;
  gap: 0;
}
@keyframes amSlideUp { from { transform: translateY(14px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

.am-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 8px;
}
.am-logo-icon { font-size: 24px; }
.am-logo-title {
  font-family: ui-monospace, monospace;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--accent-text);
}

.am-subtitle {
  text-align: center;
  font-size: 13px;
  color: var(--text-dim);
  margin: 0 0 24px;
}

/* OAuth */
.am-oauth {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}
.am-oauth-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-strong);
  background: var(--surface-raised);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background .12s, border-color .12s;
  width: 100%;
}
.am-oauth-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: var(--border-input);
}
.am-oauth-btn:disabled { opacity: .5; cursor: not-allowed; }
.am-oauth-icon { width: 20px; height: 20px; flex-shrink: 0; }

/* Divider */
.am-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.am-divider-line {
  flex: 1;
  height: 1px;
  background: var(--border);
}
.am-divider-text {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

/* Email form */
.am-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.am-input {
  width: 100%;
  background: var(--surface-input2);
  border: 1px solid var(--border-strong);
  color: var(--text);
  padding: 11px 14px;
  border-radius: 12px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  transition: border-color .12s;
  text-align: center;
}
.am-input:focus { border-color: var(--blue-border); }
.am-input::placeholder { color: var(--text-faint); }
.am-input:disabled { opacity: .5; }

.am-btn-email {
  width: 100%;
  background: var(--accent-dim);
  border: 1px solid var(--accent-border);
  color: var(--accent-text);
  padding: 11px 14px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background .12s;
}
.am-btn-email:hover:not(:disabled) { background: rgba(201,169,110,0.2); }
.am-btn-email:disabled { opacity: .5; cursor: not-allowed; }

.am-hint-muted {
  font-size: 11px;
  color: var(--text-faint);
  text-align: center;
  margin: 0;
  line-height: 1.5;
}

/* Sent state */
.am-sent {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}
.am-sent-icon { font-size: 40px; }
.am-sent-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--accent-text);
  margin: 0;
}
.am-sent-text {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.5;
  margin: 0;
}
.am-btn-back {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-dim);
  padding: 8px 16px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  margin-top: 4px;
  transition: background .12s;
}
.am-btn-back:hover { background: var(--surface-hover); color: var(--text); }

@media (max-width: 480px) {
  .am-box { padding: 28px 20px 24px; }
}
</style>
