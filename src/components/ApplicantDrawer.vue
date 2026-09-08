<script setup lang="ts">
import { ref, computed } from 'vue';
import Modal from './Modal.vue';
import {
  type Application,
  type CreditTier,
  type Decision,
  type Stage,
  creditTier,
  aprFor,
  estPaymentCents,
  dtiRatio,
  recommendation,
  moveStage,
  decide,
  stageLabel,
  formatMoney,
  formatPct,
} from '../store';
import { toast } from '../useToast';

const props = defineProps<{ app: Application }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const tier = computed<CreditTier>(() => creditTier(props.app.creditScore));
const apr = computed(() => aprFor(props.app));
const payment = computed(() => estPaymentCents(props.app));
const dti = computed(() => dtiRatio(props.app));
const rec = computed(() => recommendation(props.app));

const TIER_VAR: Record<CreditTier, string> = { Excellent: 'good', Good: 'info', Fair: 'mid', Poor: 'bad' };
const DEC_VAR: Record<Decision, string> = { Approve: 'good', Refer: 'mid', Decline: 'bad' };

const declining = ref(false);
const declineReason = ref('');

function move(stage: Stage) {
  moveStage(props.app.id, stage);
  toast(`${props.app.applicant} → ${stageLabel(stage)}`, 'info');
}
function approve() {
  decide(props.app.id, 'approved');
  toast(`${props.app.applicant} approved`, 'success');
}
function confirmDecline() {
  decide(props.app.id, 'declined', declineReason.value.trim() || undefined);
  toast(`${props.app.applicant} declined`, 'error');
  declining.value = false;
  declineReason.value = '';
}
</script>

<template>
  <Modal
    :title="app.applicant"
    :subtitle="`${app.id} · ${app.product} · submitted ${app.submittedAt}`"
    variant="sheet"
    @close="emit('close')"
  >
    <!-- recommendation banner -->
    <div class="rec" :class="DEC_VAR[rec.decision]">
      <div class="rec-head">
        <span class="rec-lab">System recommendation</span>
        <span class="rec-dec">{{ rec.decision }}</span>
      </div>
      <ul class="rec-reasons">
        <li v-for="(r, i) in rec.reasons" :key="i">{{ r }}</li>
      </ul>
    </div>

    <section>
      <h4>Underwriting</h4>
      <div class="figs">
        <div><dt>Requested</dt><dd class="tnum">{{ formatMoney(app.amountCents) }}</dd></div>
        <div><dt>Term</dt><dd class="tnum">{{ app.termMonths }} mo</dd></div>
        <div><dt>Est. APR</dt><dd class="tnum">{{ apr.toFixed(1) }}%</dd></div>
        <div><dt>Est. payment</dt><dd class="tnum">{{ formatMoney(payment, 2) }}/mo</dd></div>
        <div><dt>Credit score</dt><dd class="tnum">{{ app.creditScore }} <span class="pill plain" :class="TIER_VAR[tier]">{{ tier }}</span></dd></div>
        <div><dt>Back-end DTI</dt><dd class="tnum" :class="{ hot: dti > 0.43 }">{{ formatPct(dti) }}</dd></div>
        <div><dt>Annual income</dt><dd class="tnum">{{ formatMoney(app.annualIncomeCents) }}</dd></div>
        <div><dt>Monthly debt</dt><dd class="tnum">{{ formatMoney(app.monthlyDebtCents) }}</dd></div>
        <div><dt>Employment</dt><dd class="tnum">{{ app.employmentYears }} yr</dd></div>
      </div>
    </section>

    <section>
      <h4>Applicant</h4>
      <div class="figs">
        <div class="wide"><dt>Email</dt><dd>{{ app.email }}</dd></div>
        <div class="wide"><dt>Purpose</dt><dd>{{ app.purpose }}</dd></div>
      </div>
    </section>

    <section>
      <h4>Move through pipeline</h4>
      <div class="qa">
        <button class="btn btn-ghost btn-sm" :disabled="app.stage === 'review'" @click="move('review')">Document Review</button>
        <button class="btn btn-ghost btn-sm" :disabled="app.stage === 'underwriting'" @click="move('underwriting')">Underwriting</button>
        <button class="btn btn-primary btn-sm" :disabled="app.stage === 'approved'" @click="approve">Approve</button>
        <button class="btn btn-danger btn-sm" :disabled="app.stage === 'declined'" @click="declining = true">Decline</button>
      </div>
      <div v-if="declining" class="decline">
        <input v-model="declineReason" placeholder="Reason (optional)" @keyup.enter="confirmDecline" />
        <button class="btn btn-danger btn-sm" @click="confirmDecline">Confirm decline</button>
        <button class="btn btn-ghost btn-sm" @click="declining = false">Cancel</button>
      </div>
    </section>

    <section>
      <h4>History</h4>
      <ol class="tl">
        <li v-for="(e, i) in app.events" :key="i">
          <span class="dot" aria-hidden="true"></span>
          <span class="tl-at tnum">{{ e.at }}</span>
          <span class="tl-lab">{{ e.label }}</span>
        </li>
      </ol>
    </section>
  </Modal>
</template>

<style scoped>
.rec {
  border-radius: 12px;
  padding: 14px 16px;
  border: 1px solid transparent;
}
.rec.good { background: var(--green-soft); border-color: #bfe3d6; }
.rec.mid { background: var(--amber-soft); border-color: #eed9a8; }
.rec.bad { background: var(--red-soft); border-color: #f2caca; }
.rec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.rec-lab {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-2);
}
.rec-dec {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.rec.good .rec-dec { color: var(--green); }
.rec.mid .rec-dec { color: var(--amber); }
.rec.bad .rec-dec { color: var(--red); }
.rec-reasons {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.rec-reasons li {
  font-size: 13px;
  color: var(--ink-2);
  padding-left: 15px;
  position: relative;
}
.rec-reasons li::before {
  content: "•";
  position: absolute;
  left: 3px;
  color: var(--muted);
}
section { margin-top: 22px; }
h4 {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--faint);
  margin-bottom: 12px;
}
.figs {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 14px 16px;
}
.figs .wide { grid-column: 1 / -1; }
dt {
  font-size: 11.5px;
  color: var(--muted);
  font-weight: 600;
  margin-bottom: 2px;
}
dd {
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
dd.hot { color: var(--amber); }
.qa {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.decline {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.decline input {
  flex: 1;
  min-width: 160px;
  font: inherit;
  font-size: 13.5px;
  padding: 8px 11px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
}
.decline input:focus {
  outline: none;
  border-color: var(--red);
  box-shadow: 0 0 0 3px var(--red-soft);
}
.tl {
  list-style: none;
  border-left: 2px solid var(--border);
  margin-left: 5px;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tl li { position: relative; display: flex; flex-direction: column; }
.dot {
  position: absolute;
  left: -23px;
  top: 4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}
.tl-at { font-size: 12px; color: var(--muted); font-weight: 700; }
.tl-lab { font-size: 13.5px; font-weight: 600; }
@media (max-width: 460px) {
  .figs { grid-template-columns: 1fr 1fr; }
}
</style>
