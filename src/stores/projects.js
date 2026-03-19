import { t } from '../i18n/index.js'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sb } from '../supabase'
import { normalizeHexColor, colorKeyToHex, hexToColorKey } from '../utils'
import { useAuthStore } from './auth'

// FIX: лимит на количество проектов в одном запросе.
// select('*') без limit грузил всю таблицу разом — при сотнях проектов
// это медленно и расходует память. Лимита 500 достаточно для реального
// использования; при необходимости добавить пагинацию.
const PROJECTS_FETCH_LIMIT = 500

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
      .limit(PROJECTS_FETCH_LIMIT)  // FIX: предотвращаем загрузку всей таблицы
    if (error) throw error

    list.value = (data || []).map(p => {
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

  function localUpdate(updated) {
    const idx = list.value.findIndex(p => p.id === updated.id)
    if (idx !== -1) list.value[idx] = { ...list.value[idx], ...updated }
  }

  function localAdd(p) {
    list.value.unshift(p)
  }

  function localRemove(projectId) {
    list.value = list.value.filter(p => p.id !== projectId)
  }

  // FIX: дедупликация параллельных вызовов applyHoursDelta для одного проекта.
  // При сохранении ячейки с двумя задачами функция вызывалась дважды параллельно —
  // оба вызова читали одно и то же старое значение из byId(), считали новое
  // независимо и оба писали его в БД, давая двойной инкремент.
  // Решение: Map<projectId, Promise> — второй вызов ждёт первого.
  const _pendingDeltas = new Map() // projectId -> Promise

  async function applyHoursDelta(projectId, delta) {
    if (!delta.weighted && !delta.real) return

    // Если уже есть незавершённый вызов — ждём его завершения, затем запускаем свой.
    // Это гарантирует последовательное применение дельт.
    const inflight = _pendingDeltas.get(projectId)
    const myPromise = (async () => {
      if (inflight) await inflight.catch(() => {})

      const p = byId(projectId)
      if (!p) return

      const newW = Math.max(0, p.totalWeightedHours + delta.weighted)
      const newR = Math.max(0, p.totalRealHours     + delta.real)
      localUpdate({ id: projectId, totalWeightedHours: newW, totalRealHours: newR })

      const { error } = await sb.rpc('increment_project_hours', {
        p_project_id:     projectId,
        p_weighted_delta: delta.weighted,
        p_real_delta:     delta.real,
      })
      if (error) {
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
    })()

    _pendingDeltas.set(projectId, myPromise)
    myPromise.finally(() => {
      if (_pendingDeltas.get(projectId) === myPromise) {
        _pendingDeltas.delete(projectId)
      }
    })

    return myPromise
  }

  async function remove(projectId) {
    const { error: rpcErr } = await sb.rpc('delete_project_with_entries', {
      p_project_id: projectId,
      p_user_id:    auth.userId,
    })
    if (!rpcErr) return

    if (rpcErr.code !== 'PGRST202') {
      throw rpcErr
    }

    // Fallback: два DELETE подряд. Сначала entries, потом проект —
    // FIX: порядок изменён. Если упадёт удаление проекта, entries уже удалены
    // и проект можно удалить повторно без осиротевших записей.
    // В оригинале порядок был обратный: при сбое второго DELETE записи оставались.
    console.warn('delete_project_with_entries RPC не найдена, используем fallback. ' +
      'Создайте процедуру в БД для атомарного удаления.')
    const { error: e1 } = await sb.from('calendar_entries')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', auth.userId)
    if (e1) throw e1

    const { error: e2 } = await sb.from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', auth.userId)
    if (e2) throw e2
  }

  return { list, active, allGroups, byId, fetch, save, remove, localUpdate, localAdd, localRemove, applyHoursDelta }
})
