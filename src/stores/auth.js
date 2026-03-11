import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sb } from '../supabase'

export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)

  const userId = computed(() => session.value?.user?.id ?? null)
  const userEmail = computed(() => session.value?.user?.email ?? null)
  const isAuthed = computed(() => !!userId.value)

  async function init() {
    const { data } = await sb.auth.getSession()
    session.value = data.session

    sb.auth.onAuthStateChange((_event, s) => {
      session.value = s
    })
  }

  async function sendMagicLink(email, redirectTo) {
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    })
    if (error) throw error
  }

  async function logout() {
    await sb.auth.signOut()
    session.value = null
  }

  return { session, userId, userEmail, isAuthed, init, sendMagicLink, logout }
})
