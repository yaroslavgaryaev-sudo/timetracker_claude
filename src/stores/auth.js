import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sb } from '../supabase'

export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)
  let initialized = false

  const userId = computed(() => session.value?.user?.id ?? null)
  const userEmail = computed(() => session.value?.user?.email ?? null)
  const isAuthed = computed(() => !!userId.value)

  async function init() {
    if (initialized) return
    initialized = true

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

  // Вход через OAuth провайдер (Google, Apple)
  async function signInWithProvider(provider, redirectTo) {
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo }
    })
    if (error) throw error
  }

  // Привязка дополнительного OAuth провайдера к существующему аккаунту
  async function linkProvider(provider, redirectTo) {
    const { error } = await sb.auth.linkIdentity({
      provider,
      options: { redirectTo }
    })
    if (error) throw error
  }

  async function logout() {
    await sb.auth.signOut()
    session.value = null
  }

  return { session, userId, userEmail, isAuthed, init, sendMagicLink, signInWithProvider, linkProvider, logout }
})
