<script setup lang="ts">
import PipelineBoard from './components/PipelineBoard.vue';
import ToastHost from './components/ToastHost.vue';
</script>

<template>
  <div class="app">
    <header class="appbar">
      <div class="brand">
        <span class="mark">◆</span>
        <div class="names">
          <span class="org">Meridian Lending</span>
          <span class="tool">Origination &amp; Underwriting</span>
        </div>
      </div>
      <span class="pill info plain demo-tag">Demo</span>
    </header>

    <main class="content">
      <PipelineBoard />
    </main>

    <footer class="foot">Demonstration · sample data only · no real applicant data</footer>
    <ToastHost />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.appbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 24px;
  background: #fff;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand { display: flex; align-items: center; gap: 12px; }
.mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  font-size: 13px;
}
.names { display: flex; flex-direction: column; line-height: 1.15; }
.org { font-weight: 700; font-size: 15.5px; letter-spacing: -0.01em; }
.tool { font-size: 12px; color: var(--muted); font-weight: 500; }
.demo-tag { font-size: 11px; }
.content { flex: 1; min-width: 0; padding: 22px 24px; }
.foot {
  text-align: center;
  font-size: 12px;
  color: var(--faint);
  padding: 16px;
}
@media (max-width: 560px) {
  .content { padding: 16px; }
}
</style>
