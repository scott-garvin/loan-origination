<script setup lang="ts">
const baseUrl = import.meta.env.BASE_URL;
import { computed, ref, onMounted, onUnmounted } from "vue";
import {
  ArrowUpRight,
  Check,
  FileText,
  ShieldCheck,
  ArrowRight,
  LogOut,
} from "@lucide/vue";
import {
  seed,
  borrowerView,
  apply,
  kinds,
  kindLabels,
  formatMoney,
  stageLabels,
  type BorrowerView,
  type DocumentInput,
} from "../../shared/domain";
import DocumentEditor from "./DocumentEditor.vue";
let sample = seed();
const view = ref<BorrowerView | null>(null),
  live = ref(false),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  tag = ref(""),
  epoch = ref(0);
let expires = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const a = computed(() => view.value?.application);
const editable = computed(
  () => a.value && ["new", "review", "awaiting"].includes(a.value.stage),
);
async function api(path: string, body?: unknown) {
  const r = await fetch(`${import.meta.env.BASE_URL}api/borrower/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Portal-Session": tag.value,
    },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 401) {
    view.value = null;
    tag.value = "";
    epoch.value++;
    throw Error(
      "Your borrower session expired or changed. Open a fresh invitation.",
    );
  }
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Request failed.");
  return d;
}
async function action(fn: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Please try again.";
  } finally {
    busy.value = false;
  }
}
function useSample() {
  sample = seed();
  view.value = borrowerView(sample, "OR-2402");
  live.value = false;
  epoch.value++;
  error.value = "";
  notice.value = "Sample mode. These changes stay in this portal until reload.";
}
async function load() {
  const current = epoch.value;
  const d = await api("session");
  if (current !== epoch.value) return;
  if (tag.value && tag.value !== d.sessionTag) {
    view.value = null;
    epoch.value++;
    throw Error(
      "This browser switched borrower identities. Reopen the invitation.",
    );
  }
  expires = Date.parse(d.expiresAt);
  if (Date.now() >= expires) {
    view.value = null;
    tag.value = "";
    epoch.value++;
    throw Error("Your session expired. Ask for a new invitation.");
  }
  view.value = d;
  tag.value = d.sessionTag;
}
onMounted(() => {
  const invite = new URLSearchParams(location.hash.slice(1)).get("invite");
  if (invite) {
    history.replaceState(null, "", location.pathname + location.search);
    live.value = true;
    void action(async () => {
      await api("redeem", { invite });
      await load();
    });
  } else if (import.meta.env.VITE_LIVE_DEMO_URL) {
    useSample();
  } else {
    void action(async () => {
      try {
        live.value = true;
        await load();
      } catch {
        live.value = false;
        useSample();
      }
    });
  }
  timer = setInterval(() => {
    if (live.value && view.value) {
      if (Date.now() >= expires) {
        view.value = null;
        tag.value = "";
        epoch.value++;
        error.value = "Your session expired. Ask for a new invitation.";
      } else if (!busy.value) void action(load);
    }
  }, 15000);
});
onUnmounted(() => {
  clearInterval(timer);
  epoch.value++;
});
async function save(document: DocumentInput) {
  await action(async () => {
    if (!view.value) return;
    const e = epoch.value;
    if (live.value) {
      const v = await api("documents", {
        version: view.value.version,
        document,
      });
      if (e === epoch.value) view.value = v;
    } else {
      sample = apply(
        sample,
        { type: "document", id: view.value.application.id, document },
        "Borrower",
      );
      view.value = borrowerView(sample, view.value.application.id);
    }
    notice.value = "Document saved. Submit the complete set when ready.";
  });
}
async function submit() {
  await action(async () => {
    if (!view.value) return;
    if (live.value) {
      const current = epoch.value;
      const result = await api("submit", { version: view.value.version });
      if (current !== epoch.value) return;
      view.value = result;
    } else {
      sample = apply(
        sample,
        { type: "submit", id: view.value.application.id },
        "Borrower",
      );
      view.value = borrowerView(sample, view.value.application.id);
    }
    notice.value =
      "Documents submitted. Your reviewer can now see the updated application.";
  });
}
async function logout() {
  await action(async () => {
    if (live.value) await api("logout", {});
    view.value = null;
    tag.value = "";
    epoch.value++;
    notice.value = "You have signed out.";
  });
}
</script>
<template>
  <div class="borrower-shell">
    <header class="borrower-header">
      <a :href="baseUrl" class="wordmark"
        ><span class="brand-mark">o</span>origin<span class="wordmark-dot"
          >.</span
        ></a
      ><span class="badge">BORROWER PORTAL</span
      ><button v-if="view" class="text-button" @click="logout">
        <LogOut :size="15" /> Sign out
      </button>
    </header>
    <main class="borrower-main">
      <div class="borrower-intro">
        <span class="eyebrow">A CLEARER NEXT STEP</span>
        <h1>Your application.<br /><em>All in one place.</em></h1>
        <p>
          Share your documents, see what is still needed, and keep your review
          moving.
        </p>
      </div>
      <div class="privacy-strip">
        <ShieldCheck :size="18" /><span
          >Fictional demonstration. Use sample documents only. No real loan or
          credit inquiry.</span
        >
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <template v-if="a"
        ><div class="borrower-summary">
          <div>
            <span class="eyebrow"
              >{{ a.id }} ·
              {{ live ? "PRIVATE SESSION" : "INTERACTIVE SAMPLE" }}</span
            >
            <h2>{{ a.name }}</h2>
            <p>
              {{ a.product }} · {{ formatMoney(a.amountCents) }} ·
              {{ a.termMonths }} months
            </p>
          </div>
          <span class="badge teal">{{ stageLabels[a.stage] }}</span>
        </div>
        <div v-if="a.requested" class="discrepancies">
          <h3>Your reviewer needs a little more information.</h3>
          <p>{{ a.requested }}</p>
        </div>
        <div class="borrower-layout">
          <section>
            <div class="section-heading">
              <h2>Your document checklist</h2>
              <span>{{ a.documents.length }} of 3</span>
            </div>
            <div v-for="k in kinds" class="checklist-row">
              <span
                class="check-circle"
                :class="{ complete: a.documents.some((d) => d.kind === k) }"
                ><Check
                  v-if="a.documents.some((d) => d.kind === k)"
                  :size="17" /><FileText v-else :size="17"
              /></span>
              <div>
                <strong>{{ kindLabels[k] }}</strong
                ><small>{{
                  a.documents.find((d) => d.kind === k)?.title ||
                  "Not yet provided"
                }}</small>
              </div>
              <span class="tiny-label">{{
                a.documents.some((d) => d.kind === k) ? "Received" : "Needed"
              }}</span>
            </div>
            <p class="field-note">
              Review the text before sending. Saving a document replaces the
              previous file of the same type.
            </p>
            <button
              v-if="editable"
              class="button primary full"
              :disabled="busy || a.documents.length !== 3"
              @click="submit"
            >
              Submit documents for review<ArrowRight :size="15" />
            </button>
            <div v-else class="notice">
              Your application is with the reviewer. Document changes are
              paused.
            </div>
          </section>
          <DocumentEditor
            v-if="editable"
            :key="epoch"
            :name="a.name"
            :busy="busy"
            @save="save"
          />
        </div>
        <details v-for="d in a.documents" class="source-document">
          <summary><FileText :size="17" />{{ d.title }}</summary>
          <pre>{{ d.content }}</pre>
        </details></template
      >
      <div v-else class="empty-state">
        <ShieldCheck :size="32" />
        <h2>Start with a private invitation.</h2>
        <p>
          Your reviewer can create a link for one application. You can also
          explore a fictional example.
        </p>
        <button class="button primary" @click="useSample">
          Explore borrower sample<ArrowUpRight :size="16" />
        </button>
      </div>
    </main>
    <footer>
      Origin · A fictional lending workflow. No real messages, credit pulls, or
      funding.
    </footer>
  </div>
</template>
