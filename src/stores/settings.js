import { defineStore } from 'pinia'
import { ref, watch, onMounted } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  // 'auto' | 'dark' | 'light'
  const theme = ref(localStorage.getItem('tt_theme') || 'auto')

  // Применяем тему к <html>
  function applyTheme(t) {
    const root = document.documentElement
    if (t === 'auto') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', t)
    }
  }

  watch(theme, (t) => {
    localStorage.setItem('tt_theme', t)
    applyTheme(t)
  }, { immediate: true })

  function setTheme(t) { theme.value = t }

  return { theme, setTheme }
})
