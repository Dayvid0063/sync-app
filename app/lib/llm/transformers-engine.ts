import type { ChatMessage, EngineInfo, GenerateOptions, GenerateStats, LLMEngine, LoadProgress } from './types'
import { CACHE_NAME, type FromWorker, type ToWorker } from './protocol'
import { fileUrl, variantKey, type ModelSpec, type ModelVariant } from './models'
import type { DeviceCaps } from './device'
import { logEvent } from '~/lib/crashlog'

/** Phones get shorter replies and history: less memory per reply, within tight browser limits. */
const LIMITS = {
  phone: { maxNewTokens: 256, promptBudget: 1024 },
  other: { maxNewTokens: 512, promptBudget: 1536 }
}
/**
 * Upper bound for turning cached files into a running model. Phones that run out of memory
 * here can stall instead of failing (seen on a 4 GB Samsung), so give up and say so.
 */
const INIT_TIMEOUT_MS = 3 * 60_000

export function variantFor(spec: ModelSpec, caps: DeviceCaps): ModelVariant | undefined {
  return spec.variants[variantKey(caps.device, caps.shaderF16)]
}

/** LLMEngine backed by transformers.js running in a dedicated Web Worker. */
export class TransformersEngine implements LLMEngine {
  info: EngineInfo
  lastStats: GenerateStats | null = null

  private worker: Worker | null = null
  private loading: Promise<void> | null = null
  private nextId = 1
  private busy = false

  /** Only construct for devices the model has a variant for (see `variantFor`). */
  constructor(private spec: ModelSpec, private caps: DeviceCaps) {
    this.info = this.infoFor(caps)
  }

  private get limits() {
    return this.caps.phone ? LIMITS.phone : LIMITS.other
  }

  private variant(caps = this.caps) {
    const variant = variantFor(this.spec, caps)
    if (!variant) throw new Error(`${this.spec.label} can't run on ${caps.device} on this device`)
    return variant
  }

  private infoFor(caps: DeviceCaps): EngineInfo {
    const variant = this.variant(caps)
    return { modelId: this.spec.id, device: caps.device, dtype: variant.dtype, downloadBytes: variant.downloadBytes }
  }

  async isCached() {
    if (!('caches' in self)) return false
    const cache = await caches.open(CACHE_NAME)
    const hits = await Promise.all(this.variant().files.map(f => cache.match(fileUrl(this.spec, f))))
    return hits.every(Boolean)
  }

  /** Deletes cached files from other models/revisions/variants (e.g. the old Gemma 1B, ~0.8–1 GB). */
  async pruneCache() {
    if (!('caches' in self)) return
    const cache = await caches.open(CACHE_NAME)
    const keep = new Set(this.variant().files.map(f => fileUrl(this.spec, f)))
    for (const req of await cache.keys()) {
      if (!keep.has(req.url)) await cache.delete(req)
    }
    // The short-lived wllama build (2026-09-24) stored its ~253 MB model in OPFS; nothing else
    // in the app uses OPFS, so clear it.
    try {
      const root = await navigator.storage.getDirectory() as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> }
      for await (const name of root.keys()) await root.removeEntry(name, { recursive: true })
    }
    catch { /* OPFS unavailable: nothing to clean */ }
  }

  load(onProgress?: (p: LoadProgress) => void) {
    this.loading ??= this.loadWithFallback(onProgress).catch((err) => {
      this.loading = null
      throw err
    })
    return this.loading
  }

  private async loadWithFallback(onProgress?: (p: LoadProgress) => void) {
    try {
      await this.loadOn(this.caps, onProgress)
    }
    catch (err) {
      const cpu: DeviceCaps = { ...this.caps, device: 'wasm', shaderF16: false, reason: `WebGPU failed: ${(err as Error).message}` }
      if (this.caps.device !== 'webgpu' || !variantFor(this.spec, cpu)) throw err
      // WebGPU exists but failed (driver bugs, OOM on low-end GPUs). Retry on CPU.
      console.warn('[afronet] WebGPU load failed, falling back to WASM:', err)
      this.caps = cpu
      this.info = this.infoFor(cpu)
      await this.loadOn(cpu, onProgress)
    }
  }

  private loadOn(caps: DeviceCaps, onProgress?: (p: LoadProgress) => void) {
    this.worker?.terminate()
    const worker = new Worker(new URL('./transformers.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    const variant = this.variant(caps)

    return new Promise<void>((resolve, reject) => {
      let initTimer: ReturnType<typeof setTimeout> | undefined
      const fail = (message: string) => {
        cleanup()
        worker.terminate()
        if (this.worker === worker) this.worker = null
        reject(new Error(message))
      }
      const onMessage = (e: MessageEvent<FromWorker>) => {
        const msg = e.data
        if (msg.type === 'progress') {
          if (msg.progress.phase === 'init' && !initTimer) {
            initTimer = setTimeout(
              () => fail('Starting the AI took too long. Your device may not have enough free memory — close other apps and try again.'),
              INIT_TIMEOUT_MS
            )
          }
          onProgress?.(msg.progress)
        }
        else if (msg.type === 'ready') { cleanup(); resolve() }
        else if (msg.type === 'load-error') fail(msg.message)
      }
      const onError = (e: ErrorEvent) => fail(e.message || 'The AI worker failed to start')
      const cleanup = () => {
        clearTimeout(initTimer)
        worker.removeEventListener('message', onMessage)
        worker.removeEventListener('error', onError)
      }
      worker.addEventListener('message', onMessage)
      worker.addEventListener('error', onError)

      this.post({
        type: 'load',
        config: {
          id: this.spec.id,
          revision: this.spec.revision,
          device: caps.device,
          dtype: variant.dtype,
          files: variant.files,
          downloadBytes: variant.downloadBytes,
          externalData: variant.externalData,
          promptBudget: this.limits.promptBudget
        }
      })
    })
  }

  async *generate(messages: ChatMessage[], opts: GenerateOptions = {}): AsyncIterable<string> {
    if (!this.worker && !this.loading) {
      const started = performance.now()
      logEvent('reloading model for this question')
      await this.load()
      logEvent(`model reloaded in ${((performance.now() - started) / 1000).toFixed(1)}s`)
    }
    await this.load()
    if (this.busy) throw new Error('A reply is already being generated')
    this.busy = true

    const worker = this.worker!
    const id = this.nextId++
    const queue: string[] = []
    let finished = false
    let failure: Error | null = null
    let wake: (() => void) | null = null
    const notify = () => { wake?.(); wake = null }

    const onMessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data
      if (!('id' in msg) || msg.id !== id) return
      if (msg.type === 'token') queue.push(msg.text)
      else if (msg.type === 'done') { this.lastStats = msg.stats; finished = true }
      else if (msg.type === 'generate-error') { failure = new Error(msg.message); finished = true }
      notify()
    }
    const onAbort = () => this.post({ type: 'interrupt' })

    worker.addEventListener('message', onMessage)
    opts.signal?.addEventListener('abort', onAbort)
    if (opts.signal?.aborted) onAbort()

    try {
      this.post({ type: 'generate', id, messages, maxNewTokens: opts.maxNewTokens ?? this.limits.maxNewTokens })
      while (true) {
        if (queue.length) { yield queue.shift()!; continue }
        if (finished) break
        await new Promise<void>(r => { wake = r })
      }
      if (failure) throw failure
    }
    finally {
      // If the consumer stops early, make sure the worker stops too.
      if (!finished) onAbort()
      worker.removeEventListener('message', onMessage)
      opts.signal?.removeEventListener('abort', onAbort)
      this.busy = false
      if (this.caps.webkit) this.recycleWorker()
    }
  }

  /**
   * WebKit workaround (onnxruntime#26827): seconds after ONNX Runtime has run, Safari's WASM
   * optimiser recompiles its hot code in the background and can loop, eating memory until iOS
   * kills the page (our crash log: killed 5–10 s after a finished reply, while idle). Discarding
   * the worker right after each reply should throw that background work away with it.
   *
   * The model is NOT reloaded straight away: reloading in the background killed the page 2–5 s
   * after a reply (the old worker's memory isn't freed instantly, so two copies overlapped).
   * Instead generate() reloads it from device storage when the next question is sent
   * (~3 s on an iPhone 14 Pro).
   */
  private recycleWorker() {
    this.worker?.terminate()
    this.worker = null
    this.loading = null
    logEvent('worker discarded after reply; model reloads on next question')
  }

  private post(msg: ToWorker) {
    this.worker!.postMessage(msg)
  }
}
