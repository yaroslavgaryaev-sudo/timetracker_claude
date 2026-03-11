<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const email = ref('')
const hint = ref('Мы пришлём письмо со ссылкой для входа.')
const loading = ref(false)

async function sendLink() {
  const e = email.value.trim()
  if (!e) { alert('Введи e-mail.'); return }
  loading.value = true
  hint.value = 'Отправляю ссылку…'
  try {
    const redirectTo = window.location.origin + window.location.pathname
    await auth.sendMagicLink(e, redirectTo)
    hint.value = 'Ссылка отправлена. Открой письмо и нажми на ссылку.'
  } catch (err) {
    console.error(err)
    hint.value = 'Ошибка отправки.'
    alert('Ошибка отправки: ' + (err?.message || 'Unknown error'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="overlay open">
    <div class="row" style="margin-bottom:8px;">
      <div class="controls">
        <input
          v-model="email"
          class="input"
          placeholder="E-mail для входа (magic link)"
          style="min-width:260px;"
          @keydown.enter="sendLink"
        />
        <button class="btn primary" :disabled="loading" @click="sendLink">
          Отправить ссылку
        </button>
      </div>
      <div class="controls">
        <span class="small muted">{{ hint }}</span>
      </div>
    </div>
    <div class="hint">
      После клика по ссылке вернёшься на сайт уже авторизованным.
      Если письмо не приходит — проверь "Spam/Промоакции".
    </div>
  </div>
</template>
