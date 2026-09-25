<script setup lang="ts">
// Start crash detection before anything else runs, so every later event is logged.
useCrashLog()
</script>

<template>
  <div class="app">
    <NuxtRouteAnnouncer />
    <AppHeader />
    <NuxtPage />
  </div>
</template>

<style>
:root {
  --brand: #0f766e;
  --bubble: #0f766e;
  --bg: #f8fafc;
  --surface: #ffffff;
  --text: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --code: #f1f5f9;
  --danger: #b91c1c;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root {
    --brand: #14b8a6;
    --bubble: #0f766e;
    --bg: #0b1220;
    --surface: #111a2e;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --border: #1e293b;
    --code: #1e293b;
    --danger: #f87171;
    color-scheme: dark;
  }
}

html, body {
  margin: 0;
  height: 100%;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-text-size-adjust: 100%;
}

#__nuxt { height: 100%; }

.app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}
</style>
