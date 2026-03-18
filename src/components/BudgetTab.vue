<script setup>
import { useI18n } from '../i18n/index.js'
import { ref, computed, watch, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { sb } from '../supabase'
import ConfirmDeleteModal from './ConfirmDeleteModal.vue'

const auth = useAuthStore()
const { t } = useI18n()
const confirmDeleteModal = ref(null)

// Last row is always "Free Cash" — auto-calculated as 100 - sum of others
const DEFAULT_CATEGORIES = [
  { name: 'Taxes',       percent: 6 },
  { name: 'Vacation',    percent: 15 },
  { name: 'Investments', percent: 15 },
  { name: 'Charity',     percent: 1 },
  { name: 'Free Cash',   percent: 63 }, // last row — always auto
]

const amount  = ref('')
const cats    = ref(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: null, sort_order: i })))
const loading = ref(false)
const saving  = ref(false)
const error   = ref('')

// ── Derived ───────────────────────────────────────────────────────────────────

const total = computed(() => {
  const n = parseFloat(amount.value)
  return isNaN(n) ? 0 : n
})

// Sum of all editable rows (all except last)
const editableSum = computed(() =>
  cats.value.slice(0, -1).reduce((s, c) => s + Number(c.percent || 0), 0)
)

// Last row percent is always 100 - editableSum
const lastPercent = computed(() => Math.max(0, 100 - editableSum.value))

// All rows with computed percent for last row
const rows = computed(() =>
  cats.value.map((c, i) => {
    const pct = i === cats.value.length - 1 ? lastPercent.value : Number(c.percent || 0)
    return { ...c, pct, value: total.value * pct / 100 }
  })
)

function fmtMoney(v) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(v)
}
function fmtPct(v) {
  const r = Math.round(v * 100) / 100
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(r) + '%'
}

// ── Auto-save on any change (debounced) ──────────────────────────────────────

let saveTimer = null
function scheduleSave() {
  if (!auth.isAuthed) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    // Если предыдущее сохранение ещё не завершилось — откладываем ещё раз.
    // Это предотвращает параллельные запросы к БД при быстром вводе.
    if (saving.value) {
      scheduleSave()
      return
    }
    await saveCats()
  }, 800)
}

watch(cats, scheduleSave, { deep: true })

// ── Name inline edit ─────────────────────────────────────────────────────────

function onNameBlur(i, e) {
  const v = (e.target.value || '').trim()
  if (!v) { e.target.value = cats.value[i].name; return }
  cats.value[i].name = v
}

function autoResize(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function onPctChange(i, e) {
  let v = parseFloat(e.target.value)
  if (isNaN(v) || v < 0) v = 0
  if (v > 100) v = 100
  cats.value[i].percent = v
  e.target.value = v
}

function addCat() {
  // Insert before last row
  const newCat = { id: null, sort_order: 0, name: t('calculator.colCategory'), percent: 0 }
  cats.value.splice(cats.value.length - 1, 0, newCat)
}

async function removeCat(i) {
  if (cats.value.length <= 2) return
  const confirmed = await confirmDeleteModal.value.open(cats.value[i].name, {
    title:        'Удалить категорию',
    bodyPrefix:   'Удалить категорию',
    bodySuffix:   '?',
    subtext:      '',
    confirmLabel: t('btn.delete'),
    danger:       true,
  })
  if (!confirmed) return
  cats.value.splice(i, 1)
}

// ── Supabase ──────────────────────────────────────────────────────────────────

async function loadCats() {
  if (!auth.isAuthed) return
  loading.value = true
  error.value = ''
  try {
    const { data, error: err } = await sb
      .from('budget_categories')
      .select('*')
      .eq('user_id', auth.userId)
      .order('sort_order')
    if (err) throw err
    if (data && data.length > 0) {
      cats.value = data.map(r => ({
        id: r.id,
        sort_order: r.sort_order,
        name: r.name,
        percent: Number(r.percent),
      }))
    }
  } catch (e) {
    error.value = t('calculator.loadError')
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function saveCats() {
  if (!auth.isAuthed) return
  saving.value = true
  error.value = ''
  try {
    const now = new Date().toISOString()

    // Шаг 1: upsert ВСЕ текущие категории одним запросом.
    // Supabase upsert по onConflict: 'id' — обновит существующие, вставит новые (id=null → БД генерирует).
    // Для строк без id убираем поле id из payload, чтобы БД сгенерировала его сама.
    const toUpsert = cats.value.map((c, i) => {
      const row = {
        user_id:    auth.userId,
        sort_order: i,
        name:       c.name,
        percent:    i === cats.value.length - 1 ? lastPercent.value : Number(c.percent || 0),
        updated_at: now,
      }
      if (c.id) row.id = c.id // только если id уже есть
      return row
    })

    const { data: upserted, error: upsertErr } = await sb
      .from('budget_categories')
      .upsert(toUpsert, { onConflict: 'id', defaultToNull: false })
      .select('id, sort_order')
    if (upsertErr) throw upsertErr

    // Запоминаем сгенерированные id для новых строк
    if (upserted) {
      for (const row of upserted) {
        const cat = cats.value[row.sort_order]
        if (cat && !cat.id) cat.id = row.id
      }
    }

    // Шаг 2: удаляем строки в БД, которых больше нет в локальном списке.
    // Делаем это одним DELETE ... NOT IN (...) вместо сначала SELECT, потом DELETE.
    const activeIds = cats.value.map(c => c.id).filter(Boolean)
    if (activeIds.length > 0) {
      const { error: delErr } = await sb
        .from('budget_categories')
        .delete()
        .eq('user_id', auth.userId)
        .not('id', 'in', `(${activeIds.join(',')})`)
      if (delErr) throw delErr
    }
    // Если activeIds пуст — значит все категории новые, удалять нечего
  } catch (e) {
    error.value = t('calculator.saveError')
    console.error('saveCats error:', e)
    // Перезагружаем из БД, чтобы UI отражал реальное состояние после частичного сохранения
    await loadCats().catch(console.error)
  } finally {
    saving.value = false
  }
}

onMounted(loadCats)
watch(() => auth.isAuthed, v => {
  if (v) {
    loadCats()
  } else {
    // Сброс при logout — чтобы данные предыдущего пользователя не были видны
    cats.value = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: null, sort_order: i }))
    amount.value = ''
  }
})
</script>

<template>
  <div class="bt-root">

    <!-- Not authed warning -->
    <div v-if="!auth.isAuthed" class="bt-warn">
      Войди в аккаунт, чтобы настройки сохранялись между устройствами.
    </div>

    <!-- Table card -->
    <div class="bt-content">
      <div class="bt-card">

        <!-- ── Total / amount row ── -->
        <div class="bt-total-row">
          <div class="bt-total-row-label">{{ t('calculator.totalIncome') }}</div>
          <div class="bt-total-row-right">
            <div class="bt-amount-wrap">
              <span class="bt-currency">₽</span>
              <input
                v-model="amount"
                class="bt-amount-input mono"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
              />
            </div>
            <span v-if="error" class="bt-error-dot" :title="error">!</span>
          </div>
        </div>

        <!-- ── Column headers ── -->
        <div class="bt-cols bt-header-row">
          <span>{{ t('calculator.colCategory') }}</span>
          <span>{{ t('calculator.colPercent') }}</span>
          <span>{{ t('calculator.colAmount') }}</span>
          <span></span><!-- del -->
        </div>

        <!-- ── Category rows ── -->
        <div
          v-for="(row, i) in rows"
          :key="i"
          class="bt-cols bt-row"
          :class="{ 'bt-row-last': i === rows.length - 1 }"
        >
          <!-- Name -->
          <div class="bt-cell-name">
            <textarea
              class="bt-inline-input bt-name-input"
              rows="1"
              :value="row.name"
              @keydown.enter.prevent="e => e.target.blur()"
              @blur="onNameBlur(i, $event)"
              @input="autoResize($event)"
            />
          </div>

          <!-- Percent -->
          <div class="bt-cell-pct">
            <template v-if="i === rows.length - 1">
              <!-- Auto row: read-only -->
              <span class="mono bt-pct-auto">{{ fmtPct(row.pct) }}</span>
            </template>
            <template v-else>
              <input
                class="bt-inline-input bt-pct-input mono"
                type="number"
                min="0"
                max="100"
                step="0.01"
                :value="row.pct"
                @keydown.enter="e => e.target.blur()"
                @change="onPctChange(i, $event)"
              />
            </template>
          </div>

          <!-- Value -->
          <div class="bt-cell-val">
            <span
              class="mono"
              :class="total > 0 ? 'bt-val-active' : 'bt-val-empty'"
            >{{ total > 0 ? fmtMoney(row.value) : '—' }}</span>
          </div>

          <!-- Delete -->
          <div class="bt-cell-del">
            <button
              v-if="i < rows.length - 1"
              class="btn danger icon bt-del-btn"
              :disabled="cats.length <= 2"
              title="Удалить"
              @click="removeCat(i)"
            >✕</button>
          </div>
        </div>

        <!-- ── Add row ── -->
        <div class="bt-add-row">
          <button class="bt-btn-add" @click="addCat">{{ t('calculator.addCategory') }}</button>
        </div>

      </div>
    </div>

    <ConfirmDeleteModal ref="confirmDeleteModal" />
  </div>
</template>

<style scoped>
.bt-root { padding: 0; }

/* ── Warn ── */
.bt-warn {
  margin: 12px 18px 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(255,184,106,0.07);
  border: 1px solid rgba(255,184,106,0.2);
  font-size: 12px; color: rgba(255,184,106,0.8);
}

/* ── Content ── */
.bt-content { padding: 20px 18px 24px; }

.bt-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  max-width: 680px;
}

/* ── Total / amount row ── */
.bt-total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 22px;
  background: var(--accent-faint);
  border-bottom: 1px solid var(--accent-dim);
  gap: 12px;
  flex-wrap: wrap;
}
.bt-total-row-label {
  font-family: ui-monospace, monospace;
  font-size: 13px; font-weight: 700;
  letter-spacing: 1.5px; text-transform: uppercase;
  color: var(--accent);
}
.bt-total-row-right {
  display: flex; align-items: center; gap: 8px;
}
.bt-amount-wrap {
  display: flex; align-items: center;
  border: 1px solid var(--accent-border);
  border-radius: 10px;
  background: var(--accent-faint);
  overflow: hidden;
  transition: border-color .15s, background .15s;
}
.bt-amount-wrap:focus-within {
  border-color: var(--accent-border);
  background: var(--accent-faint);
}
.bt-currency {
  padding: 8px 8px 8px 12px;
  font-size: 15px; color: var(--accent-muted);
  font-family: ui-monospace, monospace;
  flex-shrink: 0;
}
.bt-amount-input {
  background: transparent; border: none; outline: none;
  color: var(--accent-text); font-size: 17px; font-weight: 700;
  font-family: ui-monospace, monospace;
  padding: 8px 12px 8px 4px;
  width: 180px; min-width: 100px;
}
.bt-amount-input::placeholder { color: var(--accent-muted); font-weight: 400; font-size: 15px; }

.bt-saving-dot { font-size: 13px; color: var(--text-muted); animation: spin 1s linear infinite; }
.bt-error-dot  { font-size: 15px; color: var(--danger); cursor: default; }
@keyframes spin { to { transform: rotate(360deg); } }
.bt-error { font-size: 12px; color: var(--danger); }

/* ── Column headers ── */
.bt-cols {
  display: grid;
  grid-template-columns: 1fr 100px 140px 36px;
  align-items: center;
}
.bt-header-row {
  padding: 7px 22px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-raised);
}
.bt-header-row span {
  font-size: 10px; letter-spacing: 1.5px;
  text-transform: uppercase; color: var(--text-faint);
  font-family: ui-monospace, monospace;
}

/* ── Category rows ── */
.bt-row {
  padding: 0 22px;
  border-bottom: 1px solid var(--surface-raised);
  min-height: 50px;
  transition: background .12s;
}
.bt-row:last-of-type { border-bottom: none; }
.bt-row:hover { background: var(--surface-raised); }
.bt-row-last { background: var(--accent-faint); }
.bt-row-last:hover { background: var(--accent-faint); }

.bt-cell-name { display: flex; align-items: center; padding: 8px 12px 8px 0; }
.bt-cell-pct  { display: flex; align-items: center; padding: 8px 8px 8px 0; }
.bt-cell-val  { display: flex; align-items: center; justify-content: flex-end; padding: 8px 12px 8px 0; }
.bt-cell-del  { display: flex; align-items: center; justify-content: flex-end; padding: 8px 0; }

/* ── Inline inputs ── */
.bt-inline-input {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text);
  padding: 5px 7px;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color .14s, background .14s;
  width: 100%;
  box-sizing: border-box;
}
.bt-inline-input:hover {
  border-color: var(--border-strong);
  background: var(--surface-raised);
}
.bt-inline-input:focus {
  border-color: var(--accent-border);
  background: var(--accent-faint);
}

.bt-name-input {
  font-weight: 600;
  resize: none;
  overflow: hidden;
  /* На десктопе — одна строка */
  white-space: nowrap;
  height: auto;
  line-height: 1.4;
}

.bt-pct-input {
  font-family: ui-monospace, monospace;
  width: 82px;
  color: var(--text-secondary);
}
.bt-pct-input:focus { color: var(--accent-text); }

/* Auto (last row) percent */
.bt-pct-auto {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  padding: 5px 7px;
}

/* Values */
.bt-val-active { font-size: 15px; font-weight: 700; color: var(--accent); }
.bt-val-empty  { font-size: 14px; color: var(--text-faint); }

/* Delete button — same size as pt-icon-btn in ProjectsTab */
.bt-del-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  flex-shrink: 0;
}

/* Add row */
.bt-add-row {
  padding: 11px 22px;
  border-top: 1px solid var(--surface-hover);
}
.bt-btn-add {
  background: transparent;
  border: 1px dashed var(--accent-dim);
  color: var(--accent-border);
  padding: 6px 14px; border-radius: 9px;
  cursor: pointer; font-size: 12px; font-weight: 600;
  font-family: inherit;
  transition: border-color .12s, color .12s, background .12s;
}
.bt-btn-add:hover {
  border-color: rgba(201,169,110,0.55);
  color: var(--accent);
  background: var(--accent-faint);
}

.mono { font-family: ui-monospace, monospace; }

@media (max-width: 640px) {
  .bt-content { padding: 12px 10px 16px; }

  .bt-card { max-width: 100%; border-radius: 12px; }

  /* Итого поступление: на мобильном вертикально, инпут на всю ширину */
  .bt-total-row {
    flex-direction: column;
    align-items: stretch;
    padding: 12px 14px;
    gap: 8px;
  }
  .bt-total-row-right {
    width: 100%;
  }
  .bt-amount-wrap {
    width: 100%;
  }
  .bt-amount-input {
    width: 100%;
    flex: 1;
    min-width: 0;
  }

  /* Грид колонок: имя занимает всё свободное место, % фиксированный, сумма гибкая, крестик компактный */
  .bt-cols {
    grid-template-columns: 1fr 60px 1fr 28px;
    gap: 6px;
  }
  .bt-header-row {
    padding: 6px 12px;
  }
  .bt-header-row span {
    font-size: 9px;
    letter-spacing: 0.8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bt-row {
    padding: 0 12px;
    min-height: 44px;
  }

  /* Имя категории: текст не обрезается, переносится */
  .bt-cell-name { padding: 6px 6px 6px 0; }
  .bt-name-input {
    font-size: 13px;
    padding: 4px 5px;
    /* На мобильном — разрешаем перенос слов */
    white-space: normal;
    word-break: break-word;
    overflow-wrap: break-word;
  }

  .bt-cell-pct { padding: 6px 4px 6px 0; }
  .bt-pct-input { width: 100%; font-size: 12px; padding: 4px 5px; }
  .bt-pct-auto { font-size: 12px; padding: 4px 5px; }

  .bt-cell-val { padding: 6px 4px 6px 0; justify-content: flex-start; }
  .bt-val-active { font-size: 13px; }
  .bt-val-empty  { font-size: 12px; }

  .bt-cell-del { padding: 6px 0; justify-content: center; }
  .bt-del-btn { width: 28px; height: 28px; font-size: 12px; }

  .bt-add-row { padding: 10px 12px; }
}
</style>
