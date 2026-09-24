import { MODEL, createEngine, type DeviceCaps, type EngineInfo, type LLMEngine, type LoadProgress } from '~/lib/llm'
import { requestPersistentStorage, storageEstimate } from '~/lib/storage'

export type LLMStatus = 'detecting' | 'unsupported' | 'needs-download' | 'cached' | 'loading' | 'ready' | 'error'

/**
 * Set while a load is in progress and cleared when it ends. If it's still there on the next
 * launch, the page died mid-setup (e.g. iOS killed the tab for using too much memory) —
 * we then wait for the user instead of auto-loading straight into the same crash.
 */
const SETUP_MARKER = 'afronet:setup-in-progress'

// App-wide singleton: one engine, one model in memory.
let engine: LLMEngine | null = null
let initPromise: Promise<void> | null = null

const status = ref<LLMStatus>('detecting')
const info = shallowRef<EngineInfo | null>(null)
const caps = shallowRef<DeviceCaps | null>(null)
const progress = shallowRef<LoadProgress | null>(null)
/** True while loading files that were already on the device (no network download). */
const fromCache = ref(false)
/** When the current load entered the 'init' phase (ms since epoch), for an elapsed-time display. */
const initStartedAt = ref<number | null>(null)
/** The previous launch was cut off during setup. */
const interrupted = ref(false)
const error = ref<string | null>(null)
const persisted = ref<boolean | null>(null)
const storage = shallowRef<{ usage: number, quota: number } | null>(null)

const markerValue = `${MODEL.id}@${MODEL.revision}`
function setMarker(on: boolean) {
  try {
    if (on) localStorage.setItem(SETUP_MARKER, markerValue)
    else localStorage.removeItem(SETUP_MARKER)
  }
  catch { /* storage unavailable: crash detection is best-effort */ }
}
function readMarker() {
  try { return localStorage.getItem(SETUP_MARKER) === markerValue }
  catch { return false }
}

async function refreshStorage() {
  storage.value = await storageEstimate()
}

function init() {
  initPromise ??= (async () => {
    interrupted.value = readMarker()
    const created = await createEngine()
    caps.value = created.caps
    engine = created.engine
    if (!engine) {
      status.value = 'unsupported'
      return
    }
    info.value = engine.info
    await engine.pruneCache?.().catch(err => console.warn('[afronet] cache cleanup failed:', err))
    status.value = (await engine.isCached()) ? 'cached' : 'needs-download'
    await refreshStorage()
  })().catch((err) => {
    status.value = 'error'
    error.value = err instanceof Error ? err.message : String(err)
  })
  return initPromise
}

async function load() {
  await init()
  if (!engine || status.value === 'ready' || status.value === 'loading') return
  fromCache.value = status.value === 'cached'
  status.value = 'loading'
  error.value = null
  progress.value = null
  initStartedAt.value = null
  setMarker(true)
  try {
    persisted.value = await requestPersistentStorage()
    await engine.load((p) => {
      progress.value = p
      if (p.phase === 'init' && !initStartedAt.value) initStartedAt.value = Date.now()
    })
    info.value = engine.info // may have changed if WebGPU fell back to WASM
    status.value = 'ready'
    interrupted.value = false
  }
  catch (err) {
    status.value = 'error'
    error.value = err instanceof Error ? err.message : String(err)
  }
  finally {
    setMarker(false)
    await refreshStorage()
  }
}

export function useLLM() {
  init()
  return {
    status: readonly(status),
    info: readonly(info),
    caps: readonly(caps),
    progress: readonly(progress),
    fromCache: readonly(fromCache),
    initStartedAt: readonly(initStartedAt),
    interrupted: readonly(interrupted),
    error: readonly(error),
    persisted: readonly(persisted),
    storage: readonly(storage),
    load,
    /** Throws if called before the model is ready. */
    engine: () => {
      if (!engine || status.value !== 'ready') throw new Error('Model is not ready')
      return engine
    }
  }
}
