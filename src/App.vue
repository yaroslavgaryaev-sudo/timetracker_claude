<script setup>
import { ref, watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useProjectsStore } from './stores/projects'
import { useCalendarStore } from './stores/calendar'
import LoginBox from './components/LoginBox.vue'
import CalendarGrid from './components/CalendarGrid.vue'
import ProjectsTab from './components/ProjectsTab.vue'

const auth = useAuthStore()
const proj = useProjectsStore()
const cal = useCalendarStore()

const activeTab = ref('tab1')

// Init auth listener
auth.init()

// When user logs in — load data
watch(() => auth.isAuthed, async (authed) => {
  if (authed) {
    await proj.fetch()
    await cal.loadWeek()
  } else {
    proj.list = []
    cal.reset()
  }
})
</script>

<template>
  <header>
    <h1>Time Tracker</h1>
    <div class="sub">
      x1.5: (1) выходной целиком, (2) будни до 10:00 и с 19:00.<br />
      Клик по дате в заголовке: сделать день рабочим/выходным.
    </div>
  </header>

  <div class="wrap">
    <div class="card">
      <!-- Tabs + auth bar -->
      <div class="tabs">
        <div class="tabsLeft">
          <button
            class="tabbtn"
            :class="{ active: activeTab === 'tab1' }"
            @click="activeTab = 'tab1'"
          >Календарь</button>
          <button
            class="tabbtn"
            :class="{ active: activeTab === 'tab2' }"
            @click="activeTab = 'tab2'"
          >Проекты</button>
        </div>

        <div class="authBar">
          <span class="badge">
            {{ auth.isAuthed ? `Вошёл: ${auth.userEmail}` : 'Не авторизован' }}
          </span>
          <button v-if="auth.isAuthed" class="btn" @click="auth.logout">Выйти</button>
        </div>
      </div>

      <!-- Login overlay -->
      <LoginBox v-if="!auth.isAuthed" />

      <!-- Calendar tab -->
      <div v-show="activeTab === 'tab1'" class="panel active">
        <CalendarGrid />
      </div>

      <!-- Projects tab -->
      <div v-show="activeTab === 'tab2'" class="panel active">
        <ProjectsTab />
      </div>
    </div>
  </div>
</template>
