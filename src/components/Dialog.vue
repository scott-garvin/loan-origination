<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { X } from "@lucide/vue";
defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const el = ref<HTMLDialogElement>();
let previous: HTMLElement | null = null;
onMounted(() => {
  previous = document.activeElement as HTMLElement;
  el.value?.showModal();
});
onBeforeUnmount(() => {
  el.value?.close();
  previous?.focus();
});
</script>
<template>
  <Teleport to="body"
    ><dialog
      class="dialog"
      ref="el"
      :class="{ wide }"
      :aria-label="title"
      @cancel.prevent="emit('close')"
    >
      <header class="dialog-header">
        <h2>{{ title }}</h2>
        <button
          class="icon-button"
          aria-label="Close dialog"
          @click="emit('close')"
        >
          <X :size="20" />
        </button>
      </header>
      <div class="dialog-body"><slot /></div></dialog
  ></Teleport>
</template>
