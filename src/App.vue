<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from './stores/auth'
import { useProjectsStore } from './stores/projects'
import { useCalendarStore } from './stores/calendar'
import { useSettingsStore } from './stores/settings'
import { useI18n } from './i18n/index.js'
import LoginBox from './components/LoginBox.vue'
import ToastContainer from './components/ToastContainer.vue'
import CalendarGrid from './components/CalendarGrid.vue'
import ProjectsTab from './components/ProjectsTab.vue'
import StatsTab from './components/StatsTab.vue'
import BudgetTab from './components/BudgetTab.vue'
import SettingsTab from './components/SettingsTab.vue'

const auth = useAuthStore()
const proj = useProjectsStore()
const cal = useCalendarStore()
useSettingsStore()
const { t } = useI18n()

const TABS = ['tab1','tab2','tab3','tab4','tab5']
const savedTab = localStorage.getItem('activeTab')
const activeTab = ref(TABS.includes(savedTab) ? savedTab : 'tab1')
watch(activeTab, v => localStorage.setItem('activeTab', v))

// Мобильное меню
const menuOpen = ref(false)
const TAB_NAMES = computed(() => ({ tab1: t('nav.calendar'), tab2: t('nav.projects'), tab3: t('nav.stats'), tab4: t('nav.calculator'), tab5: t('nav.settings') }))
function selectTab(tab) { activeTab.value = tab; menuOpen.value = false }
function onDocClick(e) {
  if (!e.target.closest('.mob-menu-wrap')) menuOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

// Init auth listener
auth.init()

const appLoading = ref(false)

watch(() => auth.isAuthed, async (authed) => {
  if (authed) {
    appLoading.value = true
    try {
      await Promise.all([
        proj.fetch(),
        cal.loadWeek(),
        cal.loadUsageStats()
      ])
    } finally {
      appLoading.value = false
    }
  } else {
    proj.list = []
    cal.reset()
    try {
      localStorage.removeItem('timeTrackerCurrentWeekStart')
      localStorage.removeItem('activeTab')
    } catch {}
  }
})
</script>

<template>
  <div class="wrap">
    <div class="card">
      <div class="topbar">
        <div class="topbar-left">
          <span class="topbar-logo">⏱</span>
          <span class="topbar-title">Time Tracker</span>
          <div class="topbar-divider"></div>

          <!-- Десктоп: обычные вкладки -->
          <div class="tabsLeft desktop-tabs">
            <button class="tabbtn" :class="{ active: activeTab === 'tab1' }" @click="activeTab = 'tab1'">{{ t('nav.calendar') }}</button>
            <button class="tabbtn" :class="{ active: activeTab === 'tab2' }" @click="activeTab = 'tab2'">{{ t('nav.projects') }}</button>
            <button class="tabbtn" :class="{ active: activeTab === 'tab3' }" @click="activeTab = 'tab3'">{{ t('nav.stats') }}</button>
            <button class="tabbtn" :class="{ active: activeTab === 'tab4' }" @click="activeTab = 'tab4'">{{ t('nav.calculator') }}</button>
            <button class="tabbtn" :class="{ active: activeTab === 'tab5' }" @click="activeTab = 'tab5'">{{ t('nav.settings') }}</button>
          </div>

          <!-- Мобайл: одна кнопка + выпадающий список -->
          <div class="mob-menu-wrap">
            <button class="tabbtn mob-tab-btn" @click.stop="menuOpen = !menuOpen">
              {{ TAB_NAMES[activeTab] }} ▾
            </button>
            <div v-if="menuOpen" class="mob-tab-dropdown">
              <button
                v-for="(name, key) in TAB_NAMES" :key="key"
                class="mob-tab-item"
                :class="{ active: activeTab === key }"
                @click.stop="selectTab(key)"
              >{{ name }}</button>
            </div>
          </div>
        </div>

        <div class="authBar">
          <span class="badge">{{ auth.isAuthed ? auth.userEmail : t('state.notAuthed') }}</span>
          <button v-if="auth.isAuthed" class="btn" @click="auth.logout">{{ t('btn.logout') }}</button>
        </div>
      </div>

      <LoginBox v-if="!auth.isAuthed" />

      <div v-if="appLoading" class="app-loading-overlay">
        <div class="app-loading-spinner"></div>
        <div class="app-loading-text">Загрузка данных…</div>
      </div>

      <!-- v-show сохраняет DOM и состояние компонентов между переключениями -->
      <div v-show="activeTab === 'tab1'" class="panel active">
        <CalendarGrid />
      </div>
      <div v-show="activeTab === 'tab2'" class="panel active">
        <ProjectsTab />
      </div>
      <div v-show="activeTab === 'tab3'" class="panel active">
        <StatsTab />
      </div>
      <div v-show="activeTab === 'tab4'" class="panel active">
        <BudgetTab />
      </div>
      <div v-show="activeTab === 'tab5'" class="panel active">
        <SettingsTab />
      </div>
    </div>
    <ToastContainer />
  </div>
</template>

<style scoped>
.app-loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--overlay-bg);
  border-radius: inherit;
  z-index: 100;
}
.app-loading-spinner {
  width: 28px;
  height: 28px;
  border: 2px solid var(--border-input);
  border-top-color: var(--text-secondary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.app-loading-text {
  font-size: 13px;
  color: var(--text-dim);
  letter-spacing: 0.5px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Десктоп: обычные вкладки видны, мобильное меню скрыто */
.desktop-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.mob-menu-wrap { display: none; position: relative; }

.mob-tab-btn { min-width: 140px; text-align: left; }
.mob-tab-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 300;
  background: var(--surface-modal);
  border: 1px solid var(--border-input);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  min-width: 160px;
}
.mob-tab-item {
  display: block;
  width: 100%;
  padding: 11px 16px;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
  transition: background 0.1s;
}
.mob-tab-item:last-child { border-bottom: none; }
.mob-tab-item:hover { background: var(--surface-hover); color: var(--text); }
.mob-tab-item.active { color: var(--accent-text); background: var(--accent-faint); }

@media (max-width: 640px) {
  .desktop-tabs { display: none; }
  .mob-menu-wrap { display: block; }
  .authBar .badge { display: none; }
}
</style>
