<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';

defineProps<{ title: string; subtitle?: string; variant?: 'center' | 'sheet' }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const panel = ref<HTMLElement | null>(null);
let prevActive: HTMLElement | null = null;

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => {
  prevActive = document.activeElement as HTMLElement | null;
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  panel.value?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  document.body.style.overflow = '';
  prevActive?.focus?.();
});
</script>

<template>
  <Teleport to="body">
    <div class="ov" :class="variant || 'center'" @click.self="emit('close')">
      <div
        ref="panel"
        class="mdl"
        :class="variant || 'center'"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
      >
        <header class="mh">
          <div>
            <h3>{{ title }}</h3>
            <p v-if="subtitle" class="sub">{{ subtitle }}</p>
          </div>
          <button class="x" aria-label="Close" @click="emit('close')">✕</button>
        </header>
        <div class="mb"><slot /></div>
        <footer v-if="$slots.footer" class="mf"><slot name="footer" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ov {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(16, 20, 44, 0.46);
  backdrop-filter: blur(2px);
  display: flex;
  animation: fade 0.16s ease;
}
.ov.center { align-items: center; justify-content: center; padding: 24px; }
.ov.sheet { justify-content: flex-end; }
.mdl {
  background: var(--frame);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  outline: none;
  max-height: 100%;
}
.mdl.center {
  width: min(560px, 100%);
  border-radius: 18px;
  max-height: min(92vh, 760px);
  animation: pop 0.18s ease;
}
.mdl.sheet {
  width: min(480px, 100%);
  height: 100%;
  border-left: 1px solid var(--border);
  animation: slide 0.2s ease;
}
.mh {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--border);
}
.mh h3 { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
.mh .sub { font-size: 13px; color: var(--muted); margin-top: 2px; }
.x {
  border: none;
  background: var(--bg);
  color: var(--muted);
  width: 32px;
  height: 32px;
  border-radius: 9px;
  font-size: 14px;
  flex-shrink: 0;
}
.x:hover { color: var(--ink); background: var(--border); }
.mb { padding: 20px 22px; overflow-y: auto; }
.mf {
  padding: 16px 22px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
@keyframes fade { from { opacity: 0; } }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
@keyframes slide { from { transform: translateX(24px); opacity: 0.4; } }
@media (prefers-reduced-motion: reduce) {
  .ov, .mdl.center, .mdl.sheet { animation: none; }
}
@media (max-width: 520px) {
  .mdl.sheet { width: 100%; }
}
</style>
