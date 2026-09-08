<script setup lang="ts">
import { toasts, remove } from '../useToast';
</script>

<template>
  <Teleport to="body">
    <div class="toasts" role="status" aria-live="polite">
      <TransitionGroup name="toast">
        <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind" @click="remove(t.id)">
          <span class="ico" aria-hidden="true">{{ t.kind === 'error' ? '⚠' : t.kind === 'info' ? 'ℹ' : '✓' }}</span>
          <span class="msg">{{ t.msg }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toasts {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(92vw, 400px);
}
.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--ink);
  color: #fff;
  padding: 12px 15px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.toast.success { background: #0f7d5e; }
.toast.error { background: var(--red); }
.toast.info { background: var(--brand-ink); }
.ico { font-weight: 800; }
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
</style>
