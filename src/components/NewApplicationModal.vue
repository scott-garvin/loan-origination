<script setup lang="ts">
import { reactive, ref } from 'vue';
import Modal from './Modal.vue';
import { addApplication, PRODUCTS, TERM_OPTIONS, type Application } from '../store';
import { toast } from '../useToast';

const emit = defineEmits<{ (e: 'close'): void; (e: 'created', app: Application): void }>();

const form = reactive({
  applicant: '',
  email: '',
  product: PRODUCTS[0],
  amount: '',
  term: 48,
  purpose: '',
  creditScore: '',
  income: '',
  monthlyDebt: '',
  employmentYears: '',
});
const errors = reactive<Record<string, string>>({});
const submitted = ref(false);

function num(v: string): number {
  return Number(String(v).replace(/[^0-9.]/g, ''));
}

function validate(): boolean {
  for (const k of Object.keys(errors)) delete errors[k];
  if (!form.applicant.trim()) errors.applicant = 'Applicant name is required.';
  if (!form.purpose.trim()) errors.purpose = 'Purpose is required.';
  const amount = num(form.amount);
  if (!form.amount || amount < 1000) errors.amount = 'Enter an amount of at least $1,000.';
  const score = num(form.creditScore);
  if (!form.creditScore || score < 300 || score > 850) errors.creditScore = 'Credit score must be 300–850.';
  const income = num(form.income);
  if (!form.income || income <= 0) errors.income = 'Annual income is required.';
  const debt = num(form.monthlyDebt);
  if (form.monthlyDebt !== '' && debt < 0) errors.monthlyDebt = 'Enter a valid amount.';
  const emp = num(form.employmentYears);
  if (form.employmentYears !== '' && (emp < 0 || emp > 60)) errors.employmentYears = 'Enter a valid number of years.';
  return Object.keys(errors).length === 0;
}

function submit() {
  submitted.value = true;
  if (!validate()) return;
  const app = addApplication({
    applicant: form.applicant,
    email: form.email.trim() || `${form.applicant.trim().toLowerCase().replace(/\s+/g, '.')}@example.com`,
    product: form.product,
    amountCents: Math.round(num(form.amount) * 100),
    termMonths: form.term,
    purpose: form.purpose,
    creditScore: Math.round(num(form.creditScore)),
    annualIncomeCents: Math.round(num(form.income) * 100),
    monthlyDebtCents: form.monthlyDebt === '' ? 0 : Math.round(num(form.monthlyDebt) * 100),
    employmentYears: form.employmentYears === '' ? 0 : num(form.employmentYears),
  });
  toast(`Application ${app.id} created for ${app.applicant}`, 'success');
  emit('created', app);
  emit('close');
}
</script>

<template>
  <Modal title="New application" subtitle="Add a loan application to the pipeline" variant="center" @close="emit('close')">
    <form class="form" @submit.prevent="submit">
      <div class="row2">
        <label class="field">
          <span>Applicant name</span>
          <input v-model="form.applicant" :class="{ bad: submitted && errors.applicant }" />
          <em v-if="submitted && errors.applicant">{{ errors.applicant }}</em>
        </label>
        <label class="field">
          <span>Email <small>(optional)</small></span>
          <input v-model="form.email" type="email" placeholder="name@example.com" />
        </label>
      </div>

      <div class="row2">
        <label class="field">
          <span>Product</span>
          <select v-model="form.product">
            <option v-for="p in PRODUCTS" :key="p">{{ p }}</option>
          </select>
        </label>
        <label class="field">
          <span>Purpose</span>
          <input v-model="form.purpose" placeholder="e.g. Consolidate credit cards" :class="{ bad: submitted && errors.purpose }" />
          <em v-if="submitted && errors.purpose">{{ errors.purpose }}</em>
        </label>
      </div>

      <div class="row2">
        <label class="field">
          <span>Requested amount (USD)</span>
          <input v-model="form.amount" inputmode="decimal" placeholder="25000" :class="{ bad: submitted && errors.amount }" />
          <em v-if="submitted && errors.amount">{{ errors.amount }}</em>
        </label>
        <label class="field">
          <span>Term</span>
          <select v-model.number="form.term">
            <option v-for="t in TERM_OPTIONS" :key="t" :value="t">{{ t }} months</option>
          </select>
        </label>
      </div>

      <div class="row2">
        <label class="field">
          <span>Credit score</span>
          <input v-model="form.creditScore" inputmode="numeric" placeholder="720" :class="{ bad: submitted && errors.creditScore }" />
          <em v-if="submitted && errors.creditScore">{{ errors.creditScore }}</em>
        </label>
        <label class="field">
          <span>Annual income (USD)</span>
          <input v-model="form.income" inputmode="decimal" placeholder="90000" :class="{ bad: submitted && errors.income }" />
          <em v-if="submitted && errors.income">{{ errors.income }}</em>
        </label>
      </div>

      <div class="row2">
        <label class="field">
          <span>Monthly debt (USD)</span>
          <input v-model="form.monthlyDebt" inputmode="decimal" placeholder="1200" :class="{ bad: submitted && errors.monthlyDebt }" />
          <em v-if="submitted && errors.monthlyDebt">{{ errors.monthlyDebt }}</em>
        </label>
        <label class="field">
          <span>Employment (years)</span>
          <input v-model="form.employmentYears" inputmode="decimal" placeholder="5" :class="{ bad: submitted && errors.employmentYears }" />
          <em v-if="submitted && errors.employmentYears">{{ errors.employmentYears }}</em>
        </label>
      </div>
    </form>

    <template #footer>
      <button class="btn btn-ghost" @click="emit('close')">Cancel</button>
      <button class="btn btn-primary" @click="submit">Create application</button>
    </template>
  </Modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.field small {
  color: var(--faint);
  font-weight: 500;
}
@media (max-width: 480px) {
  .row2 { grid-template-columns: 1fr; }
}
</style>
