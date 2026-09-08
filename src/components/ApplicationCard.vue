<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  type Application,
  type CreditTier,
  type Decision,
  creditTier,
  recommendation,
  dtiRatio,
  formatMoney,
  formatPct,
} from '../store';

const props = defineProps<{ app: Application }>();
defineEmits<{ (e: 'open'): void }>();

const dragging = ref(false);
const tier = computed<CreditTier>(() => creditTier(props.app.creditScore));
const rec = computed(() => recommendation(props.app));
const dti = computed(() => dtiRatio(props.app));

const TIER_VAR: Record<CreditTier, string> = { Excellent: 'good', Good: 'info', Fair: 'mid', Poor: 'bad' };
const DEC_VAR: Record<Decision, string> = { Approve: 'good', Refer: 'mid', Decline: 'bad' };

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', props.app.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  dragging.value = true;
}
function onDragEnd() {
  dragging.value = false;
}
</script>

<template>
  <article
    class="ac"
    :class="{ dragging }"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @click="$emit('open')"
  >
    <div class="top">
      <span class="id tnum">{{ app.id }}</span>
      <span class="pill" :class="TIER_VAR[tier]">{{ tier }}</span>
    </div>
    <div class="name">{{ app.applicant }}</div>
    <div class="meta">{{ app.product }}</div>
    <div class="amt tnum">{{ formatMoney(app.amountCents) }}</div>
    <div class="foot">
      <span class="pill plain" :class="DEC_VAR[rec.decision]">{{ rec.decision }}</span>
      <span class="dti tnum">DTI {{ formatPct(dti) }}</span>
    </div>
  </article>
</template>

<style scoped>
.ac {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 13px 14px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(20, 24, 60, 0.04);
  transition: border-color 0.12s ease, box-shadow 0.12s ease, transform 0.12s ease;
}
.ac:hover {
  border-color: var(--brand);
  box-shadow: 0 4px 14px rgba(86, 70, 214, 0.12);
}
.ac.dragging {
  opacity: 0.5;
  transform: rotate(-1deg);
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.id {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--faint);
}
.name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.meta {
  font-size: 12.5px;
  color: var(--muted);
  margin-top: 1px;
}
.amt {
  font-size: 18px;
  font-weight: 700;
  margin-top: 8px;
  letter-spacing: -0.01em;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 11px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.dti {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
</style>
