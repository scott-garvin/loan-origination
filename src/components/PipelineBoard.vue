<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  applications,
  STAGES,
  PRODUCTS,
  moveStage,
  stageLabel,
  formatMoney,
  formatPct,
  type Application,
  type Stage,
} from '../store';
import { toast } from '../useToast';
import ApplicationCard from './ApplicationCard.vue';
import ApplicantDrawer from './ApplicantDrawer.vue';
import NewApplicationModal from './NewApplicationModal.vue';

const search = ref('');
const productFilter = ref<'all' | string>('all');
const dragOver = ref<Stage | null>(null);

const selectedId = ref<string | null>(null);
const selected = computed(() => applications.find((a) => a.id === selectedId.value) ?? null);
const showNew = ref(false);

function matches(a: Application): boolean {
  if (productFilter.value !== 'all' && a.product !== productFilter.value) return false;
  const q = search.value.trim().toLowerCase();
  if (!q) return true;
  return `${a.applicant} ${a.product} ${a.purpose} ${a.id}`.toLowerCase().includes(q);
}

function cardsFor(stage: Stage): Application[] {
  return applications.filter((a) => a.stage === stage && matches(a));
}
function sumFor(stage: Stage): number {
  return cardsFor(stage).reduce((t, a) => t + a.amountCents, 0);
}

const metrics = computed(() => {
  const inPipeline = applications.filter((a) => a.stage === 'new' || a.stage === 'review' || a.stage === 'underwriting').length;
  const approved = applications.filter((a) => a.stage === 'approved').length;
  const declined = applications.filter((a) => a.stage === 'declined').length;
  const decided = approved + declined;
  const avg = applications.length ? applications.reduce((t, a) => t + a.amountCents, 0) / applications.length : 0;
  return {
    inPipeline,
    approved,
    approvalRate: decided ? approved / decided : 0,
    avg,
  };
});

function onDrop(stage: Stage, e: DragEvent) {
  dragOver.value = null;
  const id = e.dataTransfer?.getData('text/plain');
  if (!id) return;
  const a = applications.find((x) => x.id === id);
  if (!a || a.stage === stage) return;
  moveStage(id, stage);
  toast(`${a.applicant} → ${stageLabel(stage)}`, stage === 'declined' ? 'error' : stage === 'approved' ? 'success' : 'info');
}

function onCreated(a: Application) {
  search.value = '';
  productFilter.value = 'all';
  selectedId.value = a.id;
}
</script>

<template>
  <div class="board">
    <div class="metrics">
      <div class="metric card"><div class="lab">In pipeline</div><div class="val tnum">{{ metrics.inPipeline }}</div></div>
      <div class="metric card"><div class="lab">Approved</div><div class="val tnum green">{{ metrics.approved }}</div></div>
      <div class="metric card"><div class="lab">Approval rate</div><div class="val tnum">{{ formatPct(metrics.approvalRate) }}</div></div>
      <div class="metric card"><div class="lab">Avg requested</div><div class="val tnum">{{ formatMoney(metrics.avg) }}</div></div>
    </div>

    <div class="toolbar">
      <div class="search">
        <span class="mag" aria-hidden="true">⌕</span>
        <input v-model="search" type="search" placeholder="Search applicant, product, purpose, ID…" aria-label="Search applications" />
      </div>
      <select v-model="productFilter" aria-label="Filter by product" class="prodsel">
        <option value="all">All products</option>
        <option v-for="p in PRODUCTS" :key="p" :value="p">{{ p }}</option>
      </select>
      <div class="grow"></div>
      <button class="btn btn-primary btn-sm" @click="showNew = true">+ New application</button>
    </div>
    <p class="hint">Drag a card between columns to advance it — or open one to run the underwriting scorecard.</p>

    <div class="cols">
      <section
        v-for="s in STAGES"
        :key="s.key"
        class="col"
        :class="[`col-${s.key}`, { over: dragOver === s.key }]"
        @dragover.prevent="dragOver = s.key"
        @dragleave="dragOver === s.key && (dragOver = null)"
        @drop="onDrop(s.key, $event)"
      >
        <header class="col-head">
          <div class="col-title"><span class="acc" aria-hidden="true"></span>{{ s.label }}</div>
          <span class="col-count tnum">{{ cardsFor(s.key).length }}</span>
        </header>
        <div class="col-sum tnum">{{ formatMoney(sumFor(s.key)) }}</div>
        <div class="col-body">
          <ApplicationCard
            v-for="a in cardsFor(s.key)"
            :key="a.id"
            :app="a"
            @open="selectedId = a.id"
          />
          <p v-if="cardsFor(s.key).length === 0" class="col-empty">{{ s.hint }}</p>
        </div>
      </section>
    </div>

    <ApplicantDrawer v-if="selected" :app="selected" @close="selectedId = null" />
    <NewApplicationModal v-if="showNew" @close="showNew = false" @created="onCreated" />
  </div>
</template>

<style scoped>
.board { display: flex; flex-direction: column; gap: 16px; }
.metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.metric { padding: 15px 18px; display: flex; flex-direction: column; gap: 3px; }
.lab { font-size: 12px; font-weight: 600; color: var(--muted); }
.val { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
.val.green { color: var(--green); }

.toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.search { position: relative; flex: 1; min-width: 230px; display: flex; align-items: center; }
.search .mag { position: absolute; left: 13px; font-size: 16px; color: var(--faint); pointer-events: none; }
.search input {
  width: 100%;
  font: inherit;
  font-size: 14px;
  padding: 10px 12px 10px 36px;
  border: 1px solid var(--border-strong);
  border-radius: 11px;
  background: #fff;
  color: var(--ink);
}
.search input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
.prodsel {
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 11px;
  background: #fff;
  color: var(--ink-2);
}
.grow { flex: 1; }
.hint { font-size: 12.5px; color: var(--muted); margin-top: -4px; }

.cols {
  display: grid;
  grid-template-columns: repeat(5, minmax(232px, 1fr));
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 6px;
  align-items: start;
}
.col {
  background: var(--slate-soft);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px;
  min-height: 180px;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.col.over { background: var(--brand-soft); border-color: var(--brand); }
.col-new { --acc: var(--muted); }
.col-review { --acc: #3b6fd4; }
.col-underwriting { --acc: var(--amber); }
.col-approved { --acc: var(--green); }
.col-declined { --acc: var(--red); }
.col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.col-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.acc { width: 9px; height: 9px; border-radius: 3px; background: var(--acc); }
.col-count {
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 999px;
  min-width: 22px;
  text-align: center;
  padding: 1px 7px;
}
.col-sum {
  font-size: 11.5px;
  color: var(--faint);
  font-weight: 600;
  margin: 2px 0 10px 17px;
}
.col-body { display: flex; flex-direction: column; gap: 9px; }
.col-empty {
  font-size: 12.5px;
  color: var(--faint);
  text-align: center;
  padding: 20px 8px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
}
@media (max-width: 860px) {
  .metrics { grid-template-columns: repeat(2, 1fr); }
}
</style>
