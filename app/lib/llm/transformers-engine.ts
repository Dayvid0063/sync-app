import type { ChatMessage, EngineInfo, GenerateOptions, GenerateStats, LLMEngine, LoadProgress } from './types'
import type { FromWorker, ToWorker } from './protocol'
import { fileUrl, variantKey, type ModelSpec } from './models'
import type { DeviceCaps } from './device'

const CACHE_NAME = 'transformers-cache'
const DEFAULT_MAX_NEW_TOKENS = 512

/** LLMEngine backed by transformers.js running in a dedicated Web Worker. */
export class TransformersEngine implements LLMEngine {
  info: EngineInfo
  lastStats: GenerateStats | null = null

  private worker: Worker | null = null
  private loading: Promise<void> | null = null
  private nextId = 1
  private busy = false

  constructor(private spec: ModelSpec, private caps: DeviceCaps) {
    this.info = this.infoFor(caps)
  }

  private infoFor(caps: DeviceCaps): EngineInfo {
    const variant = this.spec.variants[variantKey(caps.device, caps.shaderF16)]
    return { modelId: this.spec.id, device: caps.device, dtype: variant.dtype, downloadBytes: variant.downloadBytes }
  }

  async isCached() {
    if (!('caches' in self)) return false
    const cache = await caches.open(CACHE_NAME)
    const variant = this.spec.variants[variantKey(this.caps.device, this.caps.shaderF16)]
    const hits = await Promise.all(variant.files.map(f => cache.match(fileUrl(this.spec, f))))
    return hits.every(Boolean)
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
      if (this.caps.device !== 'webgpu') throw err
      // WebGPU exists but failed (driver bugs, OOM on low-end GPUs). Retry on CPU.
      console.warn('[afronet] WebGPU load failed, falling back to WASM:', err)
      this.caps = { device: 'wasm', shaderF16: false, reason: `WebGPU failed: ${(err as Error).message}` }
      this.info = this.infoFor(this.caps)
      await this.loadOn(this.caps, onProgress)
    }
  }

  private loadOn(caps: DeviceCaps, onProgress?: (p: LoadProgress) => void) {
    this.worker?.terminate()
    const worker = new Worker(new URL('./transformers.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    const info = this.infoFor(caps)

    return new Promise<void>((resolve, reject) => {
      const onMessage = (e: MessageEvent<FromWorker>) => {
        const msg = e.data
        if (msg.type === 'progress') onProgress?.(msg.progress)
        else if (msg.type === 'ready') { cleanup(); resolve() }
        else if (msg.type === 'load-error') { cleanup(); worker.terminate(); reject(new Error(msg.message)) }
      }
      const onError = (e: ErrorEvent) => { cleanup(); worker.terminate(); reject(new Error(e.message || 'Worker failed to start')) }
      const cleanup = () => {
        worker.removeEventListener('message', onMessage)
        worker.removeEventListener('error', onError)
      }
      worker.addEventListener('message', onMessage)
      worker.addEventListener('error', onError)

      const variant = this.spec.variants[variantKey(caps.device, caps.shaderF16)]
      this.post({
        type: 'load',
        config: {
          modelId: this.spec.id,
          revision: this.spec.revision,
          device: info.device,
          dtype: variant.dtype,
          downloadBytes: variant.downloadBytes,
          externalData: variant.externalData
        }
      })
    })
  }

  async *generate(messages: ChatMessage[], opts: GenerateOptions = {}): AsyncIterable<string> {
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
      this.post({ type: 'generate', id, messages, maxNewTokens: opts.maxNewTokens ?? DEFAULT_MAX_NEW_TOKENS })
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
    }
  }

  private post(msg: ToWorker) {
    this.worker!.postMessage(msg)
  }
}
