import { t } from '../i18n/index.js'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sb } from '../supabase'
import { normalizeHexColor, colorKeyToHex, hexToColorKey } from '../utils'
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
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false })
    if (error) throw error

    list.value = (data || []).map(p => {
      // Prefer color_key; fall back to deriving key from legacy color_hex
      let colorKey = p.color_key ?? null
      if (!colorKey && p.color_hex) {
        colorKey = hexToColorKey(normalizeHexColor(p.color_hex)) ?? null
      }
      return {
        id: p.id,
        name: p.name,
        group: p.group_name ?? '',
        color: colorKey,
        budget: Number(p.budget ?? 0),
        comment: p.comment ?? '',
        paid: !!p.paid,
        archived: !!p.archived,
        createdAt: new Date(p.created_at).getTime(),
        totalWeightedHours: Number(p.total_weighted_hours ?? 0),
        totalRealHours:     Number(p.total_real_hours     ?? 0),
      }
    })
  }

  async function save(p) {
    // Читаем часы из актуального state в момент отправки — не из переданного snapshot p,
    // так как applyHoursDelta мог обновить их пока save() ждала в очереди микрозадач.
    const current = byId(p.id)
    const payload = {
      id: p.id,
      user_id: auth.userId,
      name: p.name,
      group_name: (p.group || '').trim() || null,
      budget: p.budget,
      comment: p.comment,
      paid: p.paid,
      archived: p.archived,
      color_key: p.color ?? null,
      color_hex: colorKeyToHex(p.color) ?? null,
      total_weighted_hours: current?.totalWeightedHours ?? p.totalWeightedHours ?? 0,
      total_real_hours:     current?.totalRealHours     ?? p.totalRealHours     ?? 0,
    }
    const { error } = await sb.from('projects').upsert(payload, { onConflict: 'id' })
    if (error) throw error
  }

  // Обновляет проект локально без запроса к БД — для optimistic UI
  function localUpdate(updated) {
    const idx = list.value.findIndex(p => p.id === updated.id)
    if (idx !== -1) list.value[idx] = { ...list.value[idx], ...updated }
  }

  // Добавляет новый проект локально
  function localAdd(p) {
    list.value.unshift(p)
  }

  // Удаляет проект локально
  function localRemove(projectId) {
    list.value = list.value.filter(p => p.id !== projectId)
  }

  // Атомарно обновляет накопленные часы проекта в БД (fire-and-forget из saveCell).
  // delta = { weighted: number, real: number } — может быть отрицательным.
  async function applyHoursDelta(projectId, delta) {
    if (!delta.weighted && !delta.real) return
    // Читаем текущее значение локально и обновляем state сразу
    const p = byId(projectId)
    if (p) {
      const newW = Math.max(0, p.totalWeightedHours + delta.weighted)
      const newR = Math.max(0, p.totalRealHours     + delta.real)
      localUpdate({ id: projectId, totalWeightedHours: newW, totalRealHours: newR })
      // Пишем в БД атомарно через инкремент
      const { error } = await sb.rpc('increment_project_hours', {
        p_project_id:     projectId,
        p_weighted_delta: delta.weighted,
        p_real_delta:     delta.real,
      })
      if (error) {
        // Откат: читаем АКТУАЛЬНОЕ состояние на момент отката, а не snapshot из замыкания.
        // К этому моменту другие saveCell могли уже успешно обновить значение,
        // поэтому откатываем только нашу дельту, не перезатираем чужие изменения.
        const current = byId(projectId)
        if (current) {
          localUpdate({
            id: projectId,
            totalWeightedHours: Math.max(0, current.totalWeightedHours - delta.weighted),
            totalRealHours:     Math.max(0, current.totalRealHours     - delta.real),
          })
        }
        console.error('applyHoursDelta error:', error)
      }
    }
  }

  async function remove(projectId) {
    // Пробуем атомарное удаление через RPC (проект + все его calendar_entries за один запрос).
    // Требует хранимой процедуры delete_project_with_entries(p_project_id, p_user_id) в БД.
    // Если процедуры нет — падаём на два отдельных DELETE (не атомарно, но работает).
    const { error: rpcErr } = await sb.rpc('delete_project_with_entries', {
      p_project_id: projectId,
      p_user_id:    auth.userId,
    })
    if (!rpcErr) return // успех — всё удалено атомарно

    // RPC недоступна (не создана в БД) — используем fallback
    if (rpcErr.code !== 'PGRST202') {
      // Настоящая ошибка (не "функция не найдена") — пробрасываем
      throw rpcErr
    }

    // Fallback: два DELETE подряд. Не атомарно — если второй упадёт, записи останутся.
    console.warn('delete_project_with_entries RPC не найдена, используем fallback. ' +
      'Создайте процедуру в БД для атомарного удаления.')
    const { error: e1 } = await sb.from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', auth.userId)
    if (e1) throw e1
    const { error: e2 } = await sb.from('calendar_entries')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', auth.userId)
    if (e2) console.warn('Проект удалён, но его записи в calendar_entries не удалены:', e2)
  }

  return { list, active, allGroups, byId, fetch, save, remove, localUpdate, localAdd, localRemove, applyHoursDelta }
})
