<script setup lang="ts">
// Shown after the page was killed while on screen; the log helps diagnose phone-only crashes.
const { report, dismiss } = useCrashLog()
const open = ref(false)
const copied = ref(false)

async function copy() {
  if (!report.value) return
  try {
    await navigator.clipboard.writeText(report.value.lines.join('\n'))
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
  catch {
    open.value = true // clipboard blocked: show the log so it can be selected manually
  }
}
</script>

<template>
  <section v-if="report" class="notice" role="status">
    <p class="title">Afronet restarted unexpectedly</p>
    <p class="text">
      Your device closed it while it was open, most likely because it ran low on memory.
      Your conversation has been kept.
    </p>
    <div class="actions">
      <button type="button" @click="open = !open">{{ open ? 'Hide details' : 'Show details' }}</button>
      <button type="button" @click="copy">{{ copied ? 'Copied' : 'Copy details' }}</button>
      <button type="button" @click="dismiss">Dismiss</button>
    </div>
    <pre v-if="open" class="log">{{ report.lines.join('\n') }}</pre>
  </section>
</template>

<style scoped>
.notice {
  display: grid;
  gap: 0.375rem;
  margin: 0.75rem auto 0;
  width: calc(100% - 2rem);
  max-width: 42rem;
  box-sizing: border-box;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-left: 4px solid #f59e0b;
  border-radius: 0.75rem;
  background: var(--surface);
  font-size: 0.875rem;
}
.title { margin: 0; font-weight: 600; }
.text { margin: 0; color: var(--muted); line-height: 1.4; }
.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.actions button {
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.3rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.log {
  margin: 0;
  max-height: 14rem;
  overflow: auto;
  padding: 0.5rem;
  border-radius: 0.5rem;
  background: var(--code);
  font-size: 0.6875rem;
  line-height: 1.4;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}
</style>
