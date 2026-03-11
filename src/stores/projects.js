import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sb } from '../supabase'
import { normalizeHexColor } from '../utils'
import { useAuthStore } from './auth'

export const useProjectsStore = defineStore('projects', () => {
  const auth = useAuthStore()
  const list = ref([])

  const active = computed(() => list.value.filter(p => !p.archived))
  const allGroups = computed(() => {
    const s = new Set()
    for (const p of list.value) {
      const g = (p.group || '').trim()
      if (g) s.add(g)
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'ru'))
  })

  function byId(id) {
    return list.value.find(p => p.id === id) ?? null
  }

  async function fetch() {
    const { data, error } = await sb
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error

    list.value = (data || []).map(p => ({
      id: p.id,
      name: p.name,
      group: p.group_name ?? '',
      color: normalizeHexColor(p.color_hex) ?? null,
      budget: Number(p.budget ?? 0),
      comment: p.comment ?? '',
      paid: !!p.paid,
      archived: !!p.archived,
      createdAt: new Date(p.created_at).getTime()
    }))
  }

  async function save(p) {
    const payload = {
      id: p.id,
      user_id: auth.userId,
      name: p.name,
      group_name: (p.group || '').trim() || null,
      budget: p.budget,
      comment: p.comment,
      paid: p.paid,
      archived: p.archived,
      color_hex: normalizeHexColor(p.color) ?? null
    }
    const { error } = await sb.from('projects').upsert(payload, { onConflict: 'id' })
    if (error) throw error
  }

  async function remove(projectId) {
    const { error: e1 } = await sb.from('projects').delete().eq('id', projectId)
    if (e1) throw e1
    const { error: e2 } = await sb.from('calendar_entries').delete().eq('project_id', projectId)
    if (e2) console.warn(e2)
  }

  return { list, active, allGroups, byId, fetch, save, remove }
})
