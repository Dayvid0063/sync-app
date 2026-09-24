<script setup lang="ts">
// First-run setup card: explains the one-time download, shows progress, handles errors.
import { formatBytes } from '~/lib/storage'

const { status, info, progress, fromCache, error, load } = useLLM()
const online = useOnline()

const percent = computed(() => Math.floor(progress.value?.percent ?? 0))
</script>

<template>
  <section class="setup" aria-live="polite">
    <template v-if="status === 'detecting'">
      <p class="muted">Checking your device…</p>
    </template>

    <template v-else-if="status === 'needs-download'">
      <h2>Set up Afronet</h2>
      <p>
        Afronet runs its AI directly on your phone, so it works without internet.
        It needs a one-time download of about
        <strong>{{ formatBytes(info?.downloadBytes ?? 0) }}</strong>.
      </p>
      <p class="muted">Use Wi-Fi if you can. After this, no data is needed to chat.</p>
      <button type="button" class="primary" :disabled="!online" @click="load()">
        Download ({{ formatBytes(info?.downloadBytes ?? 0) }})
      </button>
      <p v-if="!online" class="warn">You're offline. Connect to the internet to download.</p>
    </template>

    <template v-else-if="status === 'loading' || status === 'cached'">
      <template v-if="progress?.phase === 'init' || status === 'cached' || fromCache">
        <h2>Starting Afronet…</h2>
        <p class="muted">Preparing the AI on your device. This can take a little while on phones.</p>
        <div class="bar indeterminate"><span /></div>
      </template>
      <template v-else>
        <h2>Downloading…</h2>
        <div class="bar" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
          <span :style="{ width: `${percent}%` }" />
        </div>
        <p class="muted">
          <template v-if="progress">
            {{ formatBytes(progress.loaded) }} of {{ formatBytes(progress.total) }} · {{ percent }}%
          </template>
          <template v-else>Starting download…</template>
        </p>
        <p class="muted small">Keep this screen open until it finishes.</p>
      </template>
    </template>

    <template v-else-if="status === 'error'">
      <h2>Something went wrong</h2>
      <p class="warn">{{ error }}</p>
      <p v-if="!online" class="muted">You're offline. If the download didn't finish, reconnect and try again.</p>
      <button type="button" class="primary" @click="load()">Try again</button>
    </template>
  </section>
</template>

<style scoped>
.setup {
  display: grid;
  gap: 0.75rem;
  margin: auto;
  max-width: 26rem;
  padding: 1.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 1rem;
}

h2 { margin: 0; font-size: 1.25rem; }
p { margin: 0; line-height: 1.5; }
.muted { color: var(--muted); }
.small { font-size: 0.8125rem; }
.warn { color: var(--danger); overflow-wrap: anywhere; }

.primary {
  font: inherit;
  font-weight: 600;
  padding: 0.75rem 1.25rem;
  border: 0;
  border-radius: 0.75rem;
  background: var(--brand);
  color: #fff;
  cursor: pointer;
}
.primary:disabled { opacity: 0.5; cursor: default; }

.bar {
  height: 0.5rem;
  background: var(--border);
  border-radius: 999px;
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--brand);
  border-radius: inherit;
  transition: width 0.3s;
}
.bar.indeterminate span {
  width: 35%;
  animation: slide 1.4s ease-in-out infinite;
}
@keyframes slide {
  from { transform: translateX(-100%); }
  to { transform: translateX(300%); }
}
@media (prefers-reduced-motion: reduce) {
  .bar.indeterminate span { animation: none; width: 100%; opacity: 0.5; }
}
</style>
