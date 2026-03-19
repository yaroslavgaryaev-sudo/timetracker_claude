<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import { useToastStore } from '../stores/toast'
import { useI18n, setLocale, locale } from '../i18n/index.js'
import { sb } from '../supabase'

const auth = useAuthStore()
const settings = useSettingsStore()
const toast = useToastStore()
const { t } = useI18n()

const emit = defineEmits(['close'])

const identities = ref([])
const loadingLink = ref('')

const hasGoogle = computed(() => identities.value.some(i => i.provider === 'google'))
const hasApple = computed(() => identities.value.some(i => i.provider === 'apple'))
const hasEmail = computed(() => identities.value.some(i => i.provider === 'email'))

async function loadIdentities() {
  try {
    const { data, error } = await sb.auth.getUserIdentities()
    if (error) throw error
    identities.value = data?.identities ?? []
  } catch (e) {
    console.error(e)
  }
}

async function linkProvider(provider) {
  loadingLink.value = provider
  try {
    const redirectTo = window.location.origin + window.location.pathname
    await auth.linkProvider(provider, redirectTo)
  } catch (e) {
    console.error(e)
    toast.error('Ошибка привязки аккаунта')
    loadingLink.value = ''
  }
}

function close() { emit('close') }
function onKey(e) { if (e.key === 'Escape') close() }
onMounted(() => {
  document.addEventListener('keydown', onKey)
  loadIdentities()
})
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="pm-backdrop" @click.self="close">
      <div class="pm-box" role="dialog" aria-modal="true">

        <!-- Head -->
        <div class="pm-head">
          <div class="pm-head-left">
            <span class="pm-icon">◉</span>
            <span class="pm-title">Личный кабинет</span>
          </div>
          <button class="pm-close" @click="close" title="Закрыть (Esc)">✕</button>
        </div>

        <div class="pm-body">

          <!-- Account info -->
          <div class="pm-section">
            <div class="pm-section-title">Аккаунт</div>
            <div class="pm-email-row">
              <span class="pm-email-icon">✉</span>
              <span class="pm-email">{{ auth.userEmail }}</span>
            </div>
          </div>

          <!-- Linked accounts -->
          <div class="pm-section">
            <div class="pm-section-title">Способы входа</div>
            <div class="pm-providers">

              <!-- Google -->
              <div class="pm-provider-row">
                <div class="pm-provider-left">
                  <svg class="pm-provider-icon" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span class="pm-provider-name">Google</span>
                </div>
                <div v-if="hasGoogle" class="pm-provider-badge pm-badge-linked">✓ Привязан</div>
                <button
                  v-else
                  class="pm-provider-btn"
                  :disabled="loadingLink === 'google'"
                  @click="linkProvider('google')"
                >{{ loadingLink === 'google' ? '…' : 'Привязать' }}</button>
              </div>

              <!-- Apple -->
              <div class="pm-provider-row">
                <div class="pm-provider-left">
                  <svg class="pm-provider-icon" viewBox="0 0 24 24">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.55-1.31 3.09-2.53 3.99zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" fill="currentColor"/>
                  </svg>
                  <span class="pm-provider-name">Apple</span>
                </div>
                <div v-if="hasApple" class="pm-provider-badge pm-badge-linked">✓ Привязан</div>
                <button
                  v-else
                  class="pm-provider-btn"
                  :disabled="loadingLink === 'apple'"
                  @click="linkProvider('apple')"
                >{{ loadingLink === 'apple' ? '…' : 'Привязать' }}</button>
              </div>

              <!-- Email -->
              <div class="pm-provider-row">
                <div class="pm-provider-left">
                  <span class="pm-provider-icon pm-provider-icon-text">✉</span>
                  <span class="pm-provider-name">E-mail</span>
                </div>
                <div class="pm-provider-badge pm-badge-linked">✓ Активен</div>
              </div>

            </div>
          </div>

          <!-- Appearance -->
          <div class="pm-section">
            <div class="pm-section-title">{{ t('settings.appearance') }}</div>

            <div class="pm-setting-row">
              <span class="pm-setting-label">{{ t('settings.theme') }}</span>
              <div class="pm-theme-btns">
                <button class="pm-theme-btn" :class="{ active: settings.theme === 'auto' }" @click="settings.setTheme('auto')">
                  ⬤◐ {{ t('settings.themeSystem') }}
                </button>
                <button class="pm-theme-btn" :class="{ active: settings.theme === 'dark' }" @click="settings.setTheme('dark')">
                  🌙 {{ t('settings.themeDark') }}
                </button>
                <button class="pm-theme-btn" :class="{ active: settings.theme === 'light' }" @click="settings.setTheme('light')">
                  ☀️ {{ t('settings.themeLight') }}
                </button>
              </div>
            </div>

            <div class="pm-setting-row">
              <span class="pm-setting-label">Язык / Language</span>
              <div class="pm-theme-btns">
                <button class="pm-theme-btn" :class="{ active: locale === 'ru' }" @click="setLocale('ru')">🇷🇺 Русский</button>
                <button class="pm-theme-btn" :class="{ active: locale === 'en' }" @click="setLocale('en')">🇬🇧 English</button>
              </div>
            </div>
          </div>

        </div>

        <!-- Foot -->
        <div class="pm-foot">
          <button class="pm-logout-btn" @click="auth.logout(); close()">Выйти из аккаунта</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 400;
  background: var(--backdrop);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: pmFade .15s ease;
}
@keyframes pmFade { from { opacity: 0 } to { opacity: 1 } }

.pm-box {
  width: min(480px, 100%);
  background: var(--surface-modal);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
  overflow: hidden;
  animation: pmSlide .18s ease;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}
@keyframes pmSlide { from { transform: translateY(12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

.pm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.pm-head-left { display: flex; align-items: center; gap: 10px; }
.pm-icon { font-size: 14px; color: var(--accent); }
.pm-title {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--accent-text);
}
.pm-close {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-dim);
  width: 28px; height: 28px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  display: flex; align-items: center; justify-content: center;
  font-family: inherit;
  transition: background .12s, color .12s;
}
.pm-close:hover { background: rgba(255,100,100,0.12); color: var(--danger); }

.pm-body {
  overflow-y: auto;
  flex: 1;
  padding: 6px 0;
}

.pm-section {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}
.pm-section:last-child { border-bottom: none; }

.pm-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 12px;
  font-family: ui-monospace, monospace;
}

/* Account */
.pm-email-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pm-email-icon { font-size: 16px; color: var(--text-dim); }
.pm-email { font-size: 14px; color: var(--text); font-weight: 500; }

/* Providers */
.pm-providers { display: flex; flex-direction: column; gap: 8px; }
.pm-provider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.pm-provider-left { display: flex; align-items: center; gap: 10px; }
.pm-provider-icon { width: 20px; height: 20px; flex-shrink: 0; }
.pm-provider-icon-text { font-size: 16px; color: var(--text-secondary); }
.pm-provider-name { font-size: 14px; font-weight: 600; color: var(--text); }

.pm-provider-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
}
.pm-badge-linked {
  background: rgba(102,255,166,0.1);
  color: #66ffa6;
  border: 1px solid rgba(102,255,166,0.25);
}
.pm-provider-btn {
  background: var(--accent-dim);
  border: 1px solid var(--accent-border);
  color: var(--accent-text);
  padding: 6px 14px;
  border-radius: 9px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  transition: background .12s;
}
.pm-provider-btn:hover:not(:disabled) { background: rgba(201,169,110,0.22); }
.pm-provider-btn:disabled { opacity: .5; cursor: not-allowed; }

/* Settings */
.pm-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.pm-setting-row:last-child { margin-bottom: 0; }
.pm-setting-label { font-size: 14px; font-weight: 600; color: var(--text); flex-shrink: 0; }

.pm-theme-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.pm-theme-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 12px; border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px; font-weight: 600;
  font-family: inherit; cursor: pointer;
  transition: background .12s, border-color .12s, color .12s;
}
.pm-theme-btn:hover { background: var(--surface-hover); color: var(--text); }
.pm-theme-btn.active { background: var(--accent-dim); border-color: var(--accent-border); color: var(--accent-text); }

/* Foot */
.pm-foot {
  padding: 14px 20px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.pm-logout-btn {
  width: 100%;
  background: transparent;
  border: 1px solid var(--danger-border);
  color: var(--danger);
  padding: 10px 16px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  transition: background .12s;
}
.pm-logout-btn:hover { background: var(--danger-dim); }

@media (max-width: 480px) {
  .pm-setting-row { flex-direction: column; align-items: flex-start; }
  .pm-theme-btns { width: 100%; }
  .pm-theme-btn { flex: 1; justify-content: center; }
}
</style>
