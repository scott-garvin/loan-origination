<script setup lang="ts">
import { computed, ref } from "vue";
import {
  ArrowRight,
  FileText,
  Check,
  ExternalLink,
  Copy,
  Clock,
  AlertCircle,
} from "@lucide/vue";
import { workspace, run, execute, request, refresh } from "../workspace";
import {
  find,
  formatMoney,
  metrics,
  stageLabels,
  kinds,
  kindLabels,
  exampleDocuments,
  ready,
  type DocumentInput,
} from "../../shared/domain";
import DocumentEditor from "./DocumentEditor.vue";
import ReviewPanel from "./ReviewPanel.vue";
import Dialog from "./Dialog.vue";
const props = defineProps<{ id: string }>();
const a = computed(() => find(workspace.data, props.id));
const tab = ref("Overview");
const calc = computed(() => metrics(a.value));
const decision = ref<"approved" | "declined" | "">(""),
  note = ref(""),
  requestOpen = ref(false),
  reopen = ref(false),
  invite = ref(""),
  copied = ref(false);
async function saveDoc(d: DocumentInput) {
  await run(() => execute({ type: "document", id: a.value.id, document: d }));
}
async function examples() {
  await run(async () => {
    for (const d of exampleDocuments(a.value.name, true))
      await execute({ type: "document", id: a.value.id, document: d });
    workspace.notice =
      "Three fictional documents added, including an income discrepancy.";
  });
}
async function createInvite() {
  await run(async () => {
    if (workspace.mode === "sample") {
      invite.value = location.origin + import.meta.env.BASE_URL + "?borrower=1";
      return;
    }
    const v = await request("invites", { applicationId: a.value.id });
    invite.value =
      location.origin +
      import.meta.env.BASE_URL +
      "?borrower=1#invite=" +
      v.invite;
  });
}
async function copyInvite() {
  await run(async () => {
    await navigator.clipboard.writeText(invite.value);
    copied.value = true;
  });
}
async function confirm() {
  await run(async () => {
    if (decision.value)
      await execute({
        type: "decision",
        id: a.value.id,
        decision: decision.value,
        note: note.value,
      });
    else if (reopen.value)
      await execute({ type: "reopen", id: a.value.id, note: note.value });
    else await execute({ type: "request", id: a.value.id, note: note.value });
    decision.value = "";
    reopen.value = false;
    requestOpen.value = false;
    note.value = "";
  });
}
</script>
<template>
  <div class="application-detail">
    <div class="detail-title">
      <div>
        <span class="eyebrow">{{ a.id }} · {{ a.product }}</span>
        <h2>{{ a.name }}</h2>
        <p>{{ a.purpose }}</p>
      </div>
      <div>
        <span class="badge" :class="a.stage">{{ stageLabels[a.stage] }}</span
        ><strong class="detail-amount">{{ formatMoney(a.amountCents) }}</strong>
      </div>
    </div>
    <div class="tabs">
      <button
        v-for="t in ['Overview', 'Documents', 'AI review', 'Timeline']"
        :class="{ selected: tab === t }"
        @click="tab = t"
      >
        {{ t }}<span v-if="t === 'Documents'">{{ a.documents.length }}/3</span>
      </button>
    </div>
    <section v-if="tab === 'Overview'" class="detail-overview">
      <div class="metric-grid">
        <div>
          <span>Requested amount</span
          ><strong>{{ formatMoney(a.amountCents) }}</strong
          ><small>{{ a.termMonths }} monthly payments</small>
        </div>
        <div>
          <span>Illustrative payment</span
          ><strong>{{ formatMoney(calc.monthly, 2) }}</strong
          ><small>Fixed 9.9% demo APR</small>
        </div>
        <div>
          <span>Debt-to-income</span
          ><strong>{{
            calc.dti === null ? "—" : (calc.dti * 100).toFixed(1) + "%"
          }}</strong
          ><small
            >{{ calc.verified ? "Reviewer-confirmed" : "Declared" }} income and
            debt</small
          >
        </div>
      </div>
      <p class="field-note">
        Illustrative principal-and-interest calculation. Excludes fees and
        insurance. No credit bureau data, offer, eligibility determination, or
        automated recommendation.
      </p>
      <div class="overview-columns">
        <section>
          <div class="section-heading">
            <h3>Document readiness</h3>
            <span>{{ a.documents.length }} / 3</span>
          </div>
          <div v-for="k in kinds" class="checklist-row">
            <span
              class="check-circle"
              :class="{ complete: a.documents.some((d) => d.kind === k) }"
              ><Check
                v-if="a.documents.some((d) => d.kind === k)"
                :size="16" /><FileText v-else :size="16" /></span
            ><strong>{{ kindLabels[k] }}</strong>
          </div>
          <button class="text-button" @click="tab = 'Documents'">
            Manage documents<ArrowRight :size="14" />
          </button>
        </section>
        <section class="next-step">
          <span class="eyebrow">NEXT STEP</span>
          <h3>
            {{
              a.verified
                ? "Ready for a considered decision."
                : ready(a)
                  ? "Make the facts agree."
                  : "Complete the document set."
            }}
          </h3>
          <p>
            {{
              a.verified
                ? "The reviewer has confirmed the source facts. A human decision with a reason is still required."
                : ready(a)
                  ? "Compare the source evidence, resolve any differences, and confirm the record."
                  : "Collect an income statement, employment letter, and monthly debt summary."
            }}
          </p>
          <button
            v-if="!a.verified"
            class="button primary"
            @click="tab = ready(a) ? 'AI review' : 'Documents'"
          >
            {{ ready(a) ? "Open document review" : "Collect documents"
            }}<ArrowRight :size="15" /></button
          ><button
            v-if="a.stage === 'review' && a.verified"
            class="button primary"
            :disabled="workspace.busy"
            @click="run(() => execute({ type: 'advance', id: a.id }))"
          >
            Move to decision review<ArrowRight :size="15" />
          </button>
        </section>
      </div>
      <div v-if="a.requested" class="notice">
        <strong>Requested from borrower</strong>
        <p>{{ a.requested }}</p>
      </div>
      <div v-if="a.stage === 'underwriting'" class="decision-box">
        <div>
          <span class="eyebrow">HUMAN DECISION</span>
          <h3>Record the simulated outcome.</h3>
          <p>The AI has no decision tool. Both outcomes require your reason.</p>
        </div>
        <div class="action-row">
          <button class="button primary" @click="decision = 'approved'">
            Record approval</button
          ><button class="button secondary" @click="decision = 'declined'">
            Record decline
          </button>
        </div>
      </div>
      <div v-if="a.decisionNote" class="notice">
        <strong>Decision reason</strong>
        <p>{{ a.decisionNote }}</p>
      </div>
      <div class="action-row">
        <button
          v-if="['new', 'review', 'awaiting'].includes(a.stage)"
          class="button secondary"
          @click="requestOpen = true"
        >
          Request clarification</button
        ><button
          v-if="['underwriting', 'approved', 'declined'].includes(a.stage)"
          class="button secondary"
          @click="reopen = true"
        >
          Reopen for review</button
        ><button
          class="text-button"
          :disabled="workspace.busy"
          @click="run(refresh)"
        >
          Refresh application
        </button>
      </div>
    </section>
    <section v-if="tab === 'Documents'">
      <div class="section-heading">
        <div>
          <h3>A complete source record.</h3>
          <p>
            Three document types. Every replacement invalidates the previous
            fact review.
          </p>
        </div>
        <button
          class="button secondary"
          :disabled="workspace.busy"
          @click="createInvite"
        >
          <ExternalLink :size="15" />{{
            workspace.mode === "live" ? "Invite borrower" : "Borrower sample"
          }}
        </button>
      </div>
      <div class="document-layout">
        <div>
          <details v-for="d in a.documents" class="source-document">
            <summary>
              <FileText :size="18" />
              <div>
                <strong>{{ d.title }}</strong
                ><small>{{ kindLabels[d.kind] }} · {{ d.actor }}</small>
              </div>
            </summary>
            <pre>{{ d.content }}</pre>
          </details>
          <div v-if="!a.documents.length" class="empty-state compact">
            <FileText :size="30" />
            <h3>No documents yet.</h3>
            <p>Invite the borrower or add a fictional document to begin.</p>
          </div>
          <button
            v-if="['new', 'review', 'awaiting'].includes(a.stage)"
            class="text-button"
            :disabled="workspace.busy"
            @click="examples"
          >
            Load a fictional document set
          </button>
        </div>
        <DocumentEditor
          v-if="['new', 'review', 'awaiting'].includes(a.stage)"
          :name="a.name"
          :busy="workspace.busy"
          @save="saveDoc"
        />
        <div v-else class="notice">
          Reopen the application before replacing documents.
        </div>
      </div>
    </section>
    <ReviewPanel v-if="tab === 'AI review'" :application="a" />
    <section v-if="tab === 'Timeline'" class="timeline">
      <div v-for="e in [...a.events].reverse()" class="timeline-item">
        <span class="timeline-dot"><Clock :size="14" /></span>
        <div>
          <strong>{{ e.text }}</strong>
          <p>{{ e.actor }} · {{ new Date(e.at).toLocaleString() }}</p>
        </div>
      </div>
    </section>
    <Dialog
      v-if="decision || requestOpen || reopen"
      :title="
        decision
          ? 'Record simulated ' + decision
          : reopen
            ? 'Reopen application'
            : 'Request borrower clarification'
      "
      @close="
        decision = '';
        requestOpen = false;
        reopen = false;
        note = '';
      "
      ><form @submit.prevent="confirm">
        <p class="notice">
          <AlertCircle :size="16" /> This updates the fictional demo only. No
          real credit decision or message is sent.
        </p>
        <label
          >{{
            requestOpen
              ? "What should the borrower provide?"
              : "Reason for this action"
          }}<textarea
            v-model="note"
            required
            minlength="10"
            maxlength="600"
            rows="4"
          /></label
        ><button class="button primary full" :disabled="workspace.busy">
          Confirm {{ decision ? "decision" : reopen ? "reopen" : "request" }}
        </button>
      </form></Dialog
    >
    <Dialog
      v-if="invite"
      title="Borrower access"
      @close="
        invite = '';
        copied = false;
      "
      ><p>
        {{
          workspace.mode === "live"
            ? "This link opens only this application. It can be used once within 10 minutes and creates a 30-minute borrower session."
            : "The browser-only borrower sample is independent of the staff sample. Connect live mode for a linked workflow."
        }}
      </p>
      <a
        class="button primary full"
        :href="invite"
        target="_blank"
        rel="noopener"
        >Open borrower portal<ExternalLink :size="16" /></a
      ><button class="button secondary full" @click="copyInvite">
        <Copy :size="15" />{{ copied ? "Copied" : "Copy invitation link" }}
      </button></Dialog
    >
  </div>
</template>
