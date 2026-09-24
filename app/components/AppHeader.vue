<script setup lang="ts">
const { $pwa } = useNuxtApp()
const online = useOnline()
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <img src="/logo.svg" alt="" width="28" height="28">
      <span>Afronet</span>
    </div>
    <div class="actions">
      <!-- Pages teleport contextual buttons here (e.g. "New chat"). -->
      <div id="header-actions" class="actions" />
      <span v-if="!online" class="status off">Offline</span>
      <button
        v-if="$pwa?.showInstallPrompt && !$pwa?.isPWAInstalled"
        type="button"
        class="install"
        @click="$pwa.install()"
      >
        Install
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  padding-top: max(0.75rem, env(safe-area-inset-top));
  background: #0f766e;
  color: #f8fafc;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1.125rem;
}

.brand img {
  border-radius: 6px;
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.3);
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status {
  font-size: 0.8125rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
}

.status.off { background: #fbbf24; color: #1c1917; }

.install {
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.375rem 0.875rem;
  border: 0;
  border-radius: 999px;
  background: #f8fafc;
  color: #0f766e;
  cursor: pointer;
}
</style>
