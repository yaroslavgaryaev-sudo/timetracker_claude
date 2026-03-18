import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useToastStore = defineStore('toast', () => {
  const toasts = ref([])
  let nextId = 1

  function show(message, type = 'error', duration = 3500) {
    const id = nextId++
    toasts.value.push({ id, message, type })
    setTimeout(() => remove(id), duration)
  }

  function error(message)   { show(message, 'error') }
  function success(message) { show(message, 'success', 2500) }
  function warn(message)    { show(message, 'warn') }

  function remove(id) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return { toasts, error, success, warn, remove }
})
