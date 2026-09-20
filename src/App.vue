<script setup lang="ts">
const baseUrl = import.meta.env.BASE_URL;
import { computed, ref } from "vue";
import {
  LayoutDashboard,
  Files,
  Activity,
  ArrowUpRight,
  Plus,
  Search,
  KeyRound,
  ArrowRight,
  ChevronRight,
  SlidersHorizontal,
  RefreshCw,
  Menu,
  Sparkles,
  ShieldCheck,
  Clock,
  CheckCircle2,
  FileText,
} from "@lucide/vue";
import {
  workspace,
  run,
  connect,
  disconnect,
  execute,
  refresh,
  refreshRuns,
} from "./workspace";
import {
  stageLabels,
  formatMoney,
  products,
  inputSchema,
  parseMoney,
  ready,
  type Application,
  type Stage,
} from "../shared/domain";
import Dialog from "./components/Dialog.vue";
import ApplicationDetail from "./components/ApplicationDetail.vue";
import BorrowerPortal from "./components/BorrowerPortal.vue";
const borrower = new URLSearchParams(location.search).has("borrower");
const liveUrl = import.meta.env.VITE_LIVE_DEMO_URL;
const section = ref("Pipeline"),
  search = ref(""),
  filter = ref("all"),
  selected = ref(""),
  access = ref(false),
  key = ref(""),
  newOpen = ref(false),
  resetOpen = ref(false),
  nav = ref(false);
const name = ref(""),
  product = ref<(typeof products)[number]>("Personal"),
  amount = ref("15000"),
  term = ref<24 | 36 | 48 | 60>(48),
  income = ref("48000"),
  debt = ref("650"),
  purpose = ref("");
const active = computed(() =>
  workspace.data.applications.filter(
    (a) => !["approved", "declined"].includes(a.stage),
  ),
);
const filtered = computed(() =>
  workspace.data.applications.filter((a) => {
    const q = search.value.toLowerCase();
    return (
      (!q ||
        [a.name, a.id, a.product].some((v) => v.toLowerCase().includes(q))) &&
      (filter.value === "all" || a.product === filter.value) &&
      (section.value === "Decisions"
        ? ["approved", "declined"].includes(a.stage)
        : section.value === "Document queue"
          ? ["review", "awaiting"].includes(a.stage)
          : !["approved", "declined"].includes(a.stage))
    );
  }),
);
const lanes: Stage[] = ["new", "review", "awaiting", "underwriting"];
const total = computed(() =>
  active.value.reduce((s, a) => s + a.amountCents, 0),
);
const events = computed(() =>
  workspace.data.applications
    .flatMap((a) => a.events.map((e) => ({ ...e, id: a.id, name: a.name })))
    .sort((a, b) => b.at.localeCompare(a.at)),
);
function initials(n: string) {
  return n
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
}
function next(a: Application) {
  return a.verified
    ? "Facts confirmed"
    : a.documents.length === 3
      ? "Ready to reconcile"
      : `${3 - a.documents.length} documents needed`;
}
function open(a: Application) {
  selected.value = a.id;
  void run(refreshRuns);
}
function navigate(s: string) {
  section.value = s;
  nav.value = false;
}
async function create() {
  await run(async () => {
    await execute({
      type: "create",
      input: inputSchema.parse({
        name: name.value,
        product: product.value,
        amountCents: parseMoney(amount.value),
        termMonths: Number(term.value),
        annualIncomeCents: parseMoney(income.value),
        monthlyDebtCents: parseMoney(debt.value),
        purpose: purpose.value,
      }),
    });
    newOpen.value = false;
    selected.value = workspace.data.applications[0].id;
    name.value = "";
    purpose.value = "";
  });
}
</script>
<template>
  <BorrowerPortal v-if="borrower" />
  <div v-else class="app-shell">
    <aside class="sidebar" :class="{ open: nav }">
      <a href="#" class="wordmark"
        ><span class="brand-mark">o</span>origin<span class="wordmark-dot"
          >.</span
        ></a
      >
      <div class="workspace-card">
        <span class="workspace-avatar">M</span>
        <div>
          <strong>Meridian Lending</strong
          ><small>Fictional lending workspace</small>
        </div>
        <ChevronRight :size="14" />
      </div>
      <span class="nav-label">WORKSPACE</span>
      <nav aria-label="Main navigation">
        <button
          :class="{ selected: section === 'Pipeline' }"
          @click="navigate('Pipeline')"
        >
          <LayoutDashboard :size="18" />Pipeline<span>{{
            active.length
          }}</span></button
        ><button
          :class="{ selected: section === 'Document queue' }"
          @click="navigate('Document queue')"
        >
          <Files :size="18" />Document queue</button
        ><button
          :class="{ selected: section === 'Decisions' }"
          @click="navigate('Decisions')"
        >
          <CheckCircle2 :size="18" />Decisions</button
        ><button
          :class="{ selected: section === 'Activity' }"
          @click="navigate('Activity')"
        >
          <Activity :size="18" />Activity
        </button>
      </nav>
      <div class="sidebar-note">
        <span class="tiny-label">BUILT FOR REVIEW</span>
        <h3>A clearer path<br />from file to decision.</h3>
        <p>Source-backed facts.<br />People in control.</p>
        <a :href="`${baseUrl}?borrower=1`" target="_blank" rel="noopener"
          >Explore borrower portal<ArrowUpRight :size="15"
        /></a>
      </div>
      <button class="sidebar-reset" @click="resetOpen = true">
        <RefreshCw :size="15" />Reset demo workspace
      </button>
      <div class="sidebar-user">
        <span class="avatar">SG</span>
        <div>
          <strong>Demo reviewer</strong
          ><small>{{
            workspace.mode === "live"
              ? "Private workspace"
              : "Interactive sample"
          }}</small>
        </div>
        <ShieldCheck :size="17" />
      </div>
    </aside>
    <div class="workspace-main">
      <header class="topbar">
        <button
          class="icon-button mobile-menu"
          aria-label="Toggle navigation"
          @click="nav = !nav"
        >
          <Menu :size="21" />
        </button>
        <div>
          Workspace <span>/</span> <strong>{{ section }}</strong>
        </div>
        <div class="topbar-right">
          <span class="mode-indicator"
            ><i :class="{ live: workspace.mode === 'live' }" />{{
              workspace.mode === "live" ? "Live demo" : "Interactive sample"
            }}</span
          ><button
            class="icon-button"
            aria-label="Demo access"
            @click="access = true"
          >
            <KeyRound :size="18" /></button
          ><span class="avatar small">SG</span>
        </div>
      </header>
      <main class="main-content">
        <div class="page-heading">
          <div>
            <span class="eyebrow">THE ORIGINATION WORKSPACE</span>
            <h1>
              {{
                section === "Pipeline"
                  ? "Every application. A clear next step."
                  : section === "Document queue"
                    ? "From documents to a trusted record."
                    : section === "Decisions"
                      ? "Considered. Recorded. Accountable."
                      : "The story behind every change."
              }}
            </h1>
            <p>
              {{
                section === "Pipeline"
                  ? "Keep documents, review, and decisions moving together."
                  : section === "Document queue"
                    ? "Resolve missing information and review the evidence before moving forward."
                    : section === "Decisions"
                      ? "Simulated outcomes with a human reviewer and a recorded reason."
                      : "A timeline of the work across your fictional lending workspace."
              }}
            </p>
          </div>
          <button class="button primary" @click="newOpen = true">
            <Plus :size="17" />New application
          </button>
        </div>
        <div class="metrics-strip">
          <div>
            <span>ACTIVE PIPELINE<LayoutDashboard :size="15" /></span
            ><strong>{{ formatMoney(total) }}</strong
            ><small>{{ active.length }} applications in progress</small>
          </div>
          <div>
            <span>DOCUMENT REVIEW<Files :size="15" /></span
            ><strong>{{
              workspace.data.applications
                .filter((a) => a.stage === "review")
                .length.toString()
                .padStart(2, "0")
            }}</strong
            ><small>Evidence ready for attention</small>
          </div>
          <div>
            <span>AWAITING BORROWER<Clock :size="15" /></span
            ><strong>{{
              workspace.data.applications
                .filter((a) => a.stage === "awaiting")
                .length.toString()
                .padStart(2, "0")
            }}</strong
            ><small>Keep the next step clear</small>
          </div>
          <div>
            <span>READY FOR DECISION<CheckCircle2 :size="15" /></span
            ><strong>{{
              workspace.data.applications
                .filter((a) => a.stage === "underwriting")
                .length.toString()
                .padStart(2, "0")
            }}</strong
            ><small>Facts confirmed by a reviewer</small>
          </div>
        </div>
        <p v-if="workspace.error" role="alert" class="error">
          {{ workspace.error }}
        </p>
        <p v-if="workspace.notice" role="status" class="notice">
          {{ workspace.notice }}
        </p>
        <div v-if="section !== 'Activity'" class="toolbar">
          <div class="view-title">
            <span class="live-dot" />
            <h2>
              {{ section === "Pipeline" ? "Application pipeline" : section }}
            </h2>
            <span class="count">{{ filtered.length }}</span>
          </div>
          <div class="toolbar-actions">
            <label class="search"
              ><Search :size="16" /><input
                v-model="search"
                aria-label="Search applications"
                placeholder="Search applications" /></label
            ><label class="filter"
              ><SlidersHorizontal :size="15" /><select
                v-model="filter"
                aria-label="Filter product"
              >
                <option value="all">All products</option>
                <option v-for="p in products">{{ p }}</option>
              </select></label
            ><button
              class="icon-button"
              aria-label="Refresh workspace"
              :disabled="workspace.busy"
              @click="run(refresh)"
            >
              <RefreshCw :size="16" />
            </button>
          </div>
        </div>
        <div v-if="section === 'Pipeline'" class="pipeline">
          <section v-for="lane in lanes" class="lane">
            <header>
              <div>
                <i :class="lane" />
                <h3>{{ stageLabels[lane] }}</h3>
                <span>{{
                  filtered.filter((a) => a.stage === lane).length
                }}</span>
              </div>
            </header>
            <button
              v-for="a in filtered.filter((a) => a.stage === lane)"
              class="application-card"
              @click="open(a)"
            >
              <div class="card-top">
                <span>{{ a.id }}</span
                ><ArrowUpRight :size="16" />
              </div>
              <div class="applicant">
                <span class="avatar" :class="a.stage">{{
                  initials(a.name)
                }}</span>
                <div>
                  <h4>{{ a.name }}</h4>
                  <p>{{ a.product }}</p>
                </div>
              </div>
              <strong class="card-amount">{{
                formatMoney(a.amountCents)
              }}</strong
              ><span class="card-term">{{ a.termMonths }} months</span>
              <div class="card-docs">
                <span
                  ><FileText :size="13" />{{ a.documents.length }} of 3
                  documents</span
                ><span>{{
                  a.verified ? "Reviewed" : ready(a) ? "Received" : "Collecting"
                }}</span>
              </div>
              <div class="progress">
                <i :style="{ width: (a.documents.length / 3) * 100 + '%' }" />
              </div>
              <div class="card-bottom">
                <span :class="{ attention: a.stage === 'awaiting' }">{{
                  next(a)
                }}</span
                ><span class="reviewer-dot">SG</span>
              </div>
            </button>
            <div
              v-if="!filtered.some((a) => a.stage === lane)"
              class="lane-empty"
            >
              No applications here
            </div>
          </section>
        </div>
        <div v-else-if="section !== 'Activity'" class="application-list">
          <button v-for="a in filtered" @click="open(a)">
            <div class="applicant">
              <span class="avatar">{{ initials(a.name) }}</span>
              <div>
                <h4>{{ a.name }}</h4>
                <p>{{ a.id }} · {{ a.product }}</p>
              </div>
            </div>
            <strong>{{ formatMoney(a.amountCents) }}</strong
            ><span class="badge" :class="a.stage">{{
              stageLabels[a.stage]
            }}</span
            ><span class="list-readiness">{{ next(a) }}</span
            ><ChevronRight :size="17" />
          </button>
          <div v-if="!filtered.length" class="empty-state">
            <Search :size="30" />
            <h3>No matching applications.</h3>
            <p>Try a different search or product filter.</p>
          </div>
        </div>
        <section v-else class="activity-feed">
          <button v-for="e in events" @click="selected = e.id">
            <span class="timeline-dot"><Activity :size="15" /></span>
            <div>
              <strong>{{ e.text }}</strong>
              <p>
                {{ e.name }} · {{ e.actor }} ·
                {{ new Date(e.at).toLocaleString() }}
              </p>
            </div>
            <ChevronRight :size="16" />
          </button>
        </section>
        <div class="intelligence-footer">
          <div class="sparkle-box"><Sparkles :size="19" /></div>
          <div>
            <strong>Less chasing. More clarity.</strong>
            <p>
              Review cited document facts, resolve discrepancies, and keep the
              decision yours.
            </p>
          </div>
          <span class="badge">HUMAN REVIEW REQUIRED</span>
        </div>
      </main>
      <footer>
        Origin · Fictional lending operations
        <span>No real borrower data, credit decisions, or funding.</span>
      </footer>
    </div>
    <Dialog
      v-if="selected"
      :key="selected + workspace.epoch"
      title="Application workbench"
      wide
      @close="selected = ''"
      ><p v-if="workspace.error" class="error" role="alert">
        {{ workspace.error }}
      </p>
      <p v-if="workspace.notice" class="notice" role="status">
        {{ workspace.notice }}
      </p>
      <ApplicationDetail :id="selected"
    /></Dialog>
    <Dialog
      v-if="access"
      title="Connect your demo workspace"
      @close="access = false"
      ><p>
        Use your Origin demo access key for saved workspaces and live AI. The
        OpenAI API key belongs on the server.
      </p>
      <a v-if="liveUrl" :href="liveUrl" class="button primary full"
        >Open live Origin demo<ArrowUpRight :size="16"
      /></a>
      <form
        v-else-if="workspace.mode === 'sample'"
        @submit.prevent="
          run(async () => {
            await connect(key);
            key = '';
            access = false;
            selected = '';
          })
        "
      >
        <label
          >Demo access key<input
            v-model="key"
            type="password"
            autocomplete="off"
            required
        /></label>
        <p class="field-note">
          Your demo key stays in memory. Reconnecting restores the workspace
          while its 24-hour cookie remains valid.
        </p>
        <p v-if="workspace.error" class="error" role="alert">
          {{ workspace.error }}
        </p>
        <button class="button primary full" :disabled="workspace.busy">
          Connect live demo
        </button>
      </form>
      <template v-else
        ><p class="success-box">Connected to your private demo workspace.</p>
        <button
          class="button secondary full"
          :disabled="workspace.busy"
          @click="
            disconnect();
            access = false;
            selected = '';
          "
        >
          Return to sample
        </button></template
      ></Dialog
    >
    <Dialog
      v-if="newOpen"
      title="New fictional application"
      @close="newOpen = false"
      ><form @submit.prevent="create">
        <p class="field-note">
          Use fictional details only. These are declared values until documents
          are reviewed.
        </p>
        <label
          >Applicant name<input
            v-model="name"
            required
            maxlength="160"
            placeholder="e.g. Morgan Avery"
        /></label>
        <div class="form-grid">
          <label
            >Product<select v-model="product">
              <option v-for="p in products">{{ p }}</option>
            </select></label
          ><label
            >Term<select v-model.number="term">
              <option v-for="t in [24, 36, 48, 60]" :value="t">
                {{ t }} months
              </option>
            </select></label
          >
        </div>
        <label
          >Requested amount (USD)<input
            v-model="amount"
            inputmode="decimal"
            required
        /></label>
        <div class="form-grid">
          <label
            >Annual income (USD)<input
              v-model="income"
              inputmode="decimal"
              required /></label
          ><label
            >Monthly debt (USD)<input
              v-model="debt"
              inputmode="decimal"
              required
          /></label>
        </div>
        <label
          >Purpose<textarea
            v-model="purpose"
            required
            minlength="3"
            maxlength="300"
            rows="2"
          />
        </label>
        <p v-if="workspace.error" class="error" role="alert">
          {{ workspace.error }}
        </p>
        <button class="button primary full" :disabled="workspace.busy">
          Create application<ArrowRight :size="16" />
        </button></form
    ></Dialog>
    <Dialog
      v-if="resetOpen"
      title="Reset this demo workspace?"
      @close="resetOpen = false"
      ><p>
        This restores the fictional applications and revokes this workspace's
        borrower invitations and sessions. Saved reviews become inaccessible.
      </p>
      <button
        class="button primary full"
        :disabled="workspace.busy"
        @click="
          run(async () => {
            await execute({ type: 'reset' });
            selected = '';
            resetOpen = false;
          })
        "
      >
        Reset my demo
      </button></Dialog
    >
  </div>
</template>
