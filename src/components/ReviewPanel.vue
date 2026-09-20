<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Sparkles,
  Check,
  ArrowRight,
  RotateCw,
  FileCheck,
  AlertTriangle,
} from "@lucide/vue";
import {
  type Application,
  parseMoney,
  formatMoney,
  ready,
  reviewSchema,
} from "../../shared/domain";
import {
  workspace,
  run,
  startReview,
  resumeReview,
  refreshRuns,
  execute,
} from "../workspace";
const props = defineProps<{ application: Application }>();
const view = computed(() =>
  workspace.intakes.find((v) => v.applicationId === props.application.id),
);
const manual = ref(false),
  income = ref(""),
  debt = ref(""),
  employer = ref(""),
  note = ref("");
const stale = computed(
  () =>
    view.value &&
    view.value.stage !== "complete" &&
    view.value.revision !== props.application.revision,
);
watch(
  () => [view.value?.id, view.value?.checkpoint, manual.value],
  () => {
    const d = manual.value ? props.application.verified : view.value?.draft;
    income.value =
      d?.annualIncomeCents !== undefined
        ? String(d.annualIncomeCents / 100)
        : "";
    debt.value =
      d?.monthlyDebtCents !== undefined ? String(d.monthlyDebtCents / 100) : "";
    employer.value = d?.employer || "";
    note.value = d?.note || "";
  },
  { immediate: true },
);
function save() {
  void run(async () => {
    const review = reviewSchema.parse({
      annualIncomeCents: parseMoney(income.value),
      monthlyDebtCents: parseMoney(debt.value),
      employer: employer.value,
      note: note.value,
    });
    if (manual.value) {
      await execute({
        type: "verify",
        id: props.application.id,
        revision: props.application.revision,
        review,
      });
      manual.value = false;
    } else if (view.value) {
      await resumeReview(
        view.value,
        view.value.stage === "clarify" ? "clarify" : "approve",
        review,
      );
    }
  });
}
const nodes = ["Extract", "Validate", "Clarify", "Review", "Save"];
const active = computed(() =>
  view.value?.stage === "complete"
    ? 4
    : view.value?.stage === "review"
      ? 3
      : view.value?.stage === "clarify"
        ? 2
        : 0,
);
</script>
<template>
  <section class="review-panel">
    <div class="review-banner">
      <div class="sparkle-box"><Sparkles :size="23" /></div>
      <div>
        <span class="eyebrow">DOCUMENT INTELLIGENCE</span>
        <h3>Evidence first. Your judgment next.</h3>
        <p>
          Extract proposed facts, resolve differences, and confirm the record.
          AI never approves a loan.
        </p>
      </div>
      <span class="badge">{{
        workspace.mode === "live" ? "LangGraph" : "Guided example"
      }}</span>
    </div>
    <div class="graph-track" aria-label="Review workflow">
      <div
        v-for="(node, i) in nodes"
        :class="{ active: i === active, done: !!view && i < active }"
      >
        <span
          ><Check v-if="view && i < active" :size="12" /><template v-else>{{
            i + 1
          }}</template></span
        >{{ node }}<ArrowRight v-if="i < 4" :size="13" />
      </div>
    </div>
    <div class="action-row">
      <button
        class="button primary"
        :disabled="
          workspace.busy ||
          !ready(application) ||
          !['new', 'review', 'awaiting'].includes(application.stage)
        "
        @click="
          run(async () => {
            manual = false;
            await startReview(application.id);
          })
        "
      >
        <Sparkles :size="15" />{{
          view
            ? "Start fresh review"
            : workspace.mode === "live"
              ? "Extract document facts"
              : "Run guided review"
        }}</button
      ><button
        class="button secondary"
        :disabled="
          workspace.busy ||
          !ready(application) ||
          !['new', 'review', 'awaiting'].includes(application.stage)
        "
        @click="manual = !manual"
      >
        {{ manual ? "Close manual review" : "Review manually" }}</button
      ><button
        class="icon-button"
        aria-label="Refresh review progress"
        :disabled="workspace.busy"
        @click="run(refreshRuns)"
      >
        <RotateCw :size="16" />
      </button>
    </div>
    <p v-if="!ready(application)" class="notice">
      Collect income, employment, and debt documents before starting a review.
    </p>
    <p v-if="workspace.mode === 'sample'" class="field-note">
      Sample mode uses a deterministic parser for the supplied document format.
      Connect a demo key for real AI and durable LangGraph checkpoints.
    </p>
    <div v-if="application.verified" class="success-box">
      <FileCheck :size="22" />
      <div>
        <strong>Facts confirmed by a reviewer</strong>
        <p>
          {{ formatMoney(application.verified.annualIncomeCents) }} annual
          income · {{ application.verified.employer }}
        </p>
        <small
          >{{ application.verified.method }} · The lending decision is still a
          separate action.</small
        >
      </div>
    </div>
    <template v-if="view && !manual"
      ><div v-if="stale || view.stage === 'stale'" class="notice">
        The documents changed. This review is a historical snapshot. Start a
        fresh review before saving.
      </div>
      <div v-if="view.stage === 'retry'" class="notice">
        <p>
          This run did not finish. No facts were saved. A retry may call the
          provider again.
        </p>
        <button
          class="button secondary"
          :disabled="workspace.busy"
          @click="run(() => resumeReview(view!, 'retry'))"
        >
          Retry extraction
        </button>
      </div>
      <div v-if="view.issues.length" class="discrepancies">
        <h4>
          <AlertTriangle :size="17" />{{
            view.stage === "clarify"
              ? "Resolve before review"
              : "Reviewer attention"
          }}
        </h4>
        <ul>
          <li v-for="issue in view.issues">{{ issue }}</li>
        </ul>
      </div>
      <div v-if="view.extraction" class="evidence-grid">
        <article v-for="d in view.extraction.documents" class="evidence-card">
          <span class="eyebrow">SOURCE EVIDENCE</span>
          <h4>
            {{ view.documents.find((s) => s.id === d.documentId)?.title }}
          </h4>
          <template
            v-for="(fact, label) in {
              Employer: d.employer,
              'Gross pay': d.grossPay,
              Frequency: d.frequency,
              'Monthly debt': d.monthlyDebt,
            }"
            ><div v-if="fact.value !== null" class="fact">
              <div>
                <span>{{ label }}</span
                ><strong>{{ fact.value }}</strong>
              </div>
              <blockquote>{{ fact.quote }}</blockquote>
            </div></template
          >
        </article>
      </div>
      <details v-if="view.extraction" class="trace">
        <summary>How this review was prepared</summary>
        <p>
          {{ view.model }} · Checkpoint
          {{ view.checkpoint.slice(0, 8) || "pending" }}
        </p>
        <p>
          Source quotes are checked against the original document. Code
          annualizes supported pay periods and compares amounts. Quotes prove
          provenance, not correctness; review every proposed fact.
        </p>
      </details></template
    >
    <form
      v-if="
        manual || (view && !stale && ['clarify', 'review'].includes(view.stage))
      "
      class="review-form"
      @submit.prevent="save"
    >
      <div class="section-heading">
        <div>
          <span class="eyebrow">{{
            manual
              ? "MANUAL VERIFICATION"
              : view?.stage === "clarify"
                ? "RESOLVE DISCREPANCIES"
                : "FINAL FACT REVIEW"
          }}</span>
          <h3>
            {{
              view?.stage === "clarify" && !manual
                ? "What should the verified record say?"
                : "Confirm the document facts."
            }}
          </h3>
        </div>
      </div>
      <div class="form-grid">
        <label
          >Verified annual income (USD)<input
            v-model="income"
            required
            inputmode="decimal"
            placeholder="48000.00" /></label
        ><label
          >Verified monthly debt (USD)<input
            v-model="debt"
            required
            inputmode="decimal"
            placeholder="650.00"
        /></label>
      </div>
      <label
        >Verified employer<input
          v-model="employer"
          required
          maxlength="160" /></label
      ><label
        >Review note<textarea
          v-model="note"
          required
          minlength="10"
          maxlength="1000"
          rows="3"
          placeholder="Explain which sources you used and how you resolved any differences."
        />
      </label>
      <p class="field-note">
        Saving confirms document facts only. It does not issue credit, send
        messages, or record a lending decision.
      </p>
      <button class="button primary" :disabled="workspace.busy">
        {{
          view?.stage === "clarify" && !manual
            ? "Continue to final review"
            : "Confirm and save facts"
        }}<ArrowRight :size="15" />
      </button>
    </form>
  </section>
</template>
