<script setup>
import { useSettingsStore } from '../stores/settings'
import { useI18n, setLocale, locale } from '../i18n/index.js'

const settings = useSettingsStore()
const { t } = useI18n()
</script>

<template>
  <div class="st-root">
    <div class="st-section">
      <div class="st-section-title">{{ t('settings.appearance') }}</div>

      <div class="st-row">
        <div class="st-row-label">
          <div class="st-label">{{ t('settings.theme') }}</div>
        </div>
        <div class="st-theme-btns">
          <button class="st-theme-btn" :class="{ active: settings.theme === 'auto' }" @click="settings.setTheme('auto')">
            <span class="st-theme-icon">⬤◐</span>{{ t('settings.themeSystem') }}
          </button>
          <button class="st-theme-btn" :class="{ active: settings.theme === 'dark' }" @click="settings.setTheme('dark')">
            <span class="st-theme-icon">🌙</span>{{ t('settings.themeDark') }}
          </button>
          <button class="st-theme-btn" :class="{ active: settings.theme === 'light' }" @click="settings.setTheme('light')">
            <span class="st-theme-icon">☀️</span>{{ t('settings.themeLight') }}
          </button>
        </div>
      </div>

      <div class="st-row st-row-border">
        <div class="st-row-label">
          <div class="st-label">Язык / Language</div>
        </div>
        <div class="st-theme-btns">
          <button class="st-theme-btn" :class="{ active: locale === 'ru' }" @click="setLocale('ru')">🇷🇺 Русский</button>
          <button class="st-theme-btn" :class="{ active: locale === 'en' }" @click="setLocale('en')">🇬🇧 English</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.st-root { padding: 24px 20px; max-width: 640px; }
.st-section { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; margin-bottom: 20px; }
.st-section-title { font-family: ui-monospace, monospace; font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-muted); padding: 12px 18px 10px; border-bottom: 1px solid var(--border); background: var(--surface-raised); }
.st-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; flex-wrap: wrap; }
.st-row-border { border-top: 1px solid var(--border); }
.st-label { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 3px; }
.st-hint { font-size: 12px; color: var(--text-muted); }
.st-theme-btns { display: flex; gap: 6px; flex-shrink: 0; }
.st-theme-btn { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; transition: background 0.12s, border-color 0.12s, color 0.12s; }
.st-theme-btn:hover { background: var(--surface-hover); color: var(--text); }
.st-theme-btn.active { background: var(--accent-dim); border-color: var(--accent-border); color: var(--accent-text); }
.st-theme-icon { font-size: 14px; line-height: 1; }
@media (max-width: 640px) {
  .st-root { padding: 14px 12px; }
  .st-row { flex-direction: column; align-items: flex-start; gap: 12px; padding: 14px; }
  .st-theme-btns { width: 100%; }
  .st-theme-btn { flex: 1; justify-content: center; }
}
</style>
