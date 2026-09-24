<script setup lang="ts">
// Setup card: one-time download, startup, interrupted/unsupported/error states.
import { formatBytes } from '~/lib/storage'

const { status, info, progress, fromCache, initStartedAt, interrupted, error, load } = useLLM()
const online = useOnline()

const percent = computed(() => Math.floor(progress.value?.percent ?? 0))
const starting = computed(() => status.value === 'loading' && (progress.value?.phase === 'init' || fromCache.value))

// Elapsed seconds while starting, so a slow phone looks busy rather than frozen.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
watch(starting, (on) => {
  clearInterval(timer)
  if (on) timer = setInterval(() => { now.value = Date.now() }, 1000)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))
const elapsed = computed(() => initStartedAt.value ? Math.max(0, Math.round((now.value - initStartedAt.value) / 1000)) : 0)
</script>

<template>
  <section class="setup" aria-live="polite">
    <template v-if="status === 'detecting'">
      <p class="muted">Checking your device…</p>
    </template>

    <template v-else-if="status === 'unsupported'">
      <h2>Not supported on this device yet</h2>
      <p>
        Afronet needs <strong>WebGPU</strong> to run its AI on your device, and this browser or
        device doesn't provide it.
      </p>
      <p class="muted">
        Try an up-to-date Chrome, Edge or Samsung Internet on Android, or Safari on iOS 26 or later.
        Support for more devices is coming.
      </p>
    </template>

    <template v-else-if="status === 'needs-download'">
      <template v-if="interrupted">
        <h2>Finish setting up</h2>
        <p>Setup didn't finish last time. Anything already downloaded is kept, so this continues where it stopped.</p>
      </template>
      <template v-else>
        <h2>Set up Afronet</h2>
        <p>
          Afronet runs its AI directly on your device, so it works without internet.
          It needs a one-time download of about
          <strong>{{ formatBytes(info?.downloadBytes ?? 0) }}</strong>.
        </p>
      </template>
      <p class="muted">Use Wi-Fi if you can. After this, no data is needed to chat.</p>
      <button type="button" class="primary" :disabled="!online" @click="load()">
        {{ interrupted ? 'Continue' : 'Download' }} ({{ formatBytes(info?.downloadBytes ?? 0) }})
      </button>
      <p v-if="!online" class="warn">You're offline. Connect to the internet to download.</p>
    </template>

    <template v-else-if="status === 'cached'">
      <!-- Only shown when auto-start is held back after an interrupted setup. -->
      <h2>Afronet stopped while starting</h2>
      <p>
        Last time, your device closed Afronet before the AI finished starting. This usually means
        it was low on memory.
      </p>
      <p class="muted">Close other apps and browser tabs, then try again. Nothing needs to be downloaded.</p>
      <button type="button" class="primary" @click="load()">Start Afronet</button>
    </template>

    <template v-else-if="status === 'loading'">
      <template v-if="starting">
        <h2>Starting Afronet…</h2>
        <p class="muted">Preparing the AI on your device. This can take a little while on phones.</p>
        <div class="bar indeterminate"><span /></div>
        <p v-if="elapsed >= 5" class="muted small">{{ elapsed }}s</p>
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
      <p v-if="!online" class="muted">You're offline. If the download didn't finish, reconnect and try again — finished files are kept.</p>
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
