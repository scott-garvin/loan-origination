<script setup lang="ts">
import { ref } from "vue";
import { Upload, FileText } from "@lucide/vue";
import {
  kinds,
  kindLabels,
  documentSchema,
  exampleDocuments,
  type DocumentInput,
} from "../../shared/domain";
const props = defineProps<{ name: string; busy?: boolean }>();
const emit = defineEmits<{ save: [document: DocumentInput] }>();
const kind = ref<DocumentInput["kind"]>("income"),
  title = ref(""),
  content = ref(""),
  error = ref("");
function example() {
  const d = exampleDocuments(props.name).find((d) => d.kind === kind.value)!;
  title.value = d.title;
  content.value = d.content;
  error.value = "";
}
async function upload(e: Event) {
  error.value = "";
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    if (!/\.(txt|md)$/i.test(f.name) || f.size > 16000)
      throw Error("Choose a .txt or .md file up to 16 KB.");
    const s = await f.text();
    if (s.includes("\0")) throw Error("This file is not plain text.");
    title.value = f.name;
    content.value = s;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "File unavailable.";
  }
  (e.target as HTMLInputElement).value = "";
}
function save() {
  const r = documentSchema.safeParse({
    kind: kind.value,
    title: title.value,
    content: content.value,
  });
  if (!r.success) {
    error.value = r.error.issues[0].message;
    return;
  }
  emit("save", r.data);
}
</script>
<template>
  <form class="document-editor" @submit.prevent="save">
    <div class="section-heading">
      <div>
        <span class="eyebrow">ADD OR REPLACE</span>
        <h3>Bring the source into view.</h3>
      </div>
      <FileText :size="22" />
    </div>
    <div class="form-grid">
      <label
        >Document type<select v-model="kind" aria-label="Document type">
          <option v-for="k in kinds" :value="k">{{ kindLabels[k] }}</option>
        </select></label
      ><label
        >Document title<input
          v-model="title"
          required
          maxlength="160"
          placeholder="e.g. September pay statement"
      /></label>
    </div>
    <div class="upload-line">
      <label class="button secondary"
        ><Upload :size="15" /> Upload text file<input
          class="sr-only"
          type="file"
          accept=".txt,.md"
          @change="upload" /></label
      ><button type="button" class="text-button" @click="example">
        Use fictional example
      </button>
    </div>
    <label
      >Document text<textarea
        v-model="content"
        rows="8"
        required
        maxlength="12000"
        placeholder="Paste fictional document text here. Include currency and payment frequency."
      />
    </label>
    <p class="field-note">
      Plain text only, up to 12,000 characters. No PDFs, scans, account numbers,
      or real borrower information.
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <button class="button primary" :disabled="busy">Save document</button>
  </form>
</template>
