import { createEngine, type DeviceCaps, type EngineInfo, type LLMEngine, type LoadProgress } from '~/lib/llm'
import { requestPersistentStorage, storageEstimate } from '~/lib/storage'

export type LLMStatus = 'detecting' | 'needs-download' | 'cached' | 'loading' | 'ready' | 'error'

// App-wide singleton: one engine, one model in memory.
let engine: LLMEngine | null = null
let initPromise: Promise<void> | null = null

const status = ref<LLMStatus>('detecting')
const info = shallowRef<EngineInfo | null>(null)
const caps = shallowRef<DeviceCaps | null>(null)
const progress = shallowRef<LoadProgress | null>(null)
/** True while loading files that were already on the device (no network download). */
const fromCache = ref(false)
const error = ref<string | null>(null)
const persisted = ref<boolean | null>(null)
const storage = shallowRef<{ usage: number, quota: number } | null>(null)

async function refreshStorage() {
  storage.value = await storageEstimate()
}

function init() {
  initPromise ??= (async () => {
    const created = await createEngine()
    engine = created.engine
    caps.value = created.caps
    info.value = engine.info
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
  try {
    persisted.value = await requestPersistentStorage()
    await engine.load((p) => { progress.value = p })
    info.value = engine.info // may have changed if WebGPU fell back to WASM
    status.value = 'ready'
  }
  catch (err) {
    status.value = 'error'
    error.value = err instanceof Error ? err.message : String(err)
  }
  finally {
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
