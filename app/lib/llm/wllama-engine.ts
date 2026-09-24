// LLMEngine backed by wllama (llama.cpp compiled to WebAssembly, with WebGPU when available).
//
// Why not transformers.js/ONNX Runtime: on iOS Safari it crashed the tab — first while loading
// Gemma 1B, then a few seconds after every reply with Gemma 270M (matches open ORT/WebKit
// issues). llama.cpp's WebGPU backend in wllama was designed for Safari's tight per-tab memory
// limit: weights are read from OPFS instead of being copied into the WASM heap, and memory is
// allocated up front instead of growing per request.
import { ModelValidationStatus, Wllama, type Model } from '@wllama/wllama/esm/index.js'
// Self-hosted runtimes (hashed assets, precached by the service worker) — the defaults are CDNs,
// which would break offline.
import wasmUrl from '@wllama/wllama/esm/wasm/wllama.wasm?url'
// Compat build for browsers without JSPI / WASM memory64 — notably Safari.
import compatWasmUrl from '@wllama/wllama-compat/wasm/wllama.wasm?url'
import compatWorkerCode from '@wllama/wllama-compat/wasm/wllama.js?raw'
import type { ChatMessage, EngineInfo, GenerateOptions, GenerateStats, LLMEngine, LoadProgress } from './types'
import type { DeviceCaps } from './device'

export interface GgufModelSpec {
  label: string
  /** Pinned-revision URL of a single .gguf file. */
  url: string
  quant: string
  downloadBytes: number
  /** Context window we allocate. Small = less memory. */
  contextTokens: number
}

const DEFAULT_MAX_NEW_TOKENS = 512
/** Rough prompt budget in characters (≈ 3–4 chars per token), leaving room for the reply. */
const MAX_PROMPT_CHARS = 4000
/** Upper bound for turning the downloaded file into a running model (see TransformersEngine). */
const INIT_TIMEOUT_MS = 3 * 60_000

/** Drops the oldest user/assistant pairs until the conversation fits the prompt budget. */
function fitToBudget(messages: ChatMessage[]) {
  const system = messages[0]?.role === 'system' ? [messages[0]] : []
  let turns = messages.slice(system.length)
  const size = (msgs: ChatMessage[]) => msgs.reduce((n, m) => n + m.content.length, 0)
  while (size([...system, ...turns]) > MAX_PROMPT_CHARS && turns.length > 1) turns = turns.slice(2)
  return [...system, ...turns]
}

export class WllamaEngine implements LLMEngine {
  info: EngineInfo
  lastStats: GenerateStats | null = null

  private wllama: Wllama
  private loading: Promise<void> | null = null
  private busy = false

  constructor(private spec: GgufModelSpec, private caps: DeviceCaps) {
    this.info = {
      modelId: spec.label,
      device: caps.device,
      dtype: spec.quant,
      downloadBytes: spec.downloadBytes
    }
    // allowOffline: use the OPFS copy without re-validating it against the server.
    this.wllama = new Wllama({ default: wasmUrl }, { allowOffline: true, suppressNativeLog: true })
    this.wllama.setCompat({ wasm: compatWasmUrl, worker: { code: compatWorkerCode } })
  }

  private async cachedModel(): Promise<Model | undefined> {
    const models = await this.wllama.modelManager.getModels()
    return models.find(m => m.url === this.spec.url && m.validate() === ModelValidationStatus.VALID)
  }

  async isCached() {
    return !!(await this.cachedModel())
  }

  /** Deletes other models from OPFS and the old transformers.js cache (up to ~1 GB). */
  async pruneCache() {
    await this.wllama.cacheManager.deleteMany(e => e.metadata.originalURL !== this.spec.url)
    if ('caches' in self) await caches.delete('transformers-cache')
  }

  load(onProgress?: (p: LoadProgress) => void) {
    this.loading ??= this.doLoad(onProgress).catch((err) => {
      this.loading = null
      throw err
    })
    return this.loading
  }

  private async doLoad(onProgress?: (p: LoadProgress) => void) {
    // 1. Download straight to OPFS (streamed to disk; skipped when already there).
    const model = (await this.cachedModel()) ?? await this.wllama.modelManager.downloadModel(this.spec.url, {
      progressCallback: ({ loaded, total }) => onProgress?.({
        phase: 'download',
        loaded,
        total: total || this.spec.downloadBytes,
        percent: Math.min(99, (loaded / (total || this.spec.downloadBytes)) * 100)
      })
    })

    // 2. Start llama.cpp on it.
    onProgress?.({ phase: 'init', loaded: this.spec.downloadBytes, total: this.spec.downloadBytes, percent: 100 })
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(
        'Starting the AI took too long. Your device may not have enough free memory — close other apps and try again.'
      )), INIT_TIMEOUT_MS)
    })
    try {
      await Promise.race([
        this.wllama.loadModel(model, {
          n_ctx: this.spec.contextTokens,
          n_parallel: 1, // one conversation at a time: don't reserve memory for more
          n_gpu_layers: this.caps.device === 'wasm' ? 0 : undefined // undefined = all layers on GPU
        }),
        timeout
      ])
    }
    catch (err) {
      await this.wllama.exit().catch(() => {})
      throw err
    }
    finally {
      clearTimeout(timer)
    }
  }

  async *generate(messages: ChatMessage[], opts: GenerateOptions = {}): AsyncIterable<string> {
    await this.load()
    if (this.busy) throw new Error('A reply is already being generated')
    this.busy = true

    let tokens = 0
    let firstTokenAt = 0
    const start = performance.now()
    try {
      const stream = await this.wllama.createChatCompletion({
        messages: fitToBudget(messages),
        stream: true,
        max_tokens: opts.maxNewTokens ?? DEFAULT_MAX_NEW_TOKENS,
        temperature: 0.7,
        top_k: 64,
        top_p: 0.95,
        abortSignal: opts.signal
      })
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content
        if (!text) continue
        if (tokens++ === 0) firstTokenAt = performance.now()
        yield text
      }
    }
    catch (err) {
      // Stop pressed: end quietly; the caller checks signal.aborted.
      if (!opts.signal?.aborted) throw err
    }
    finally {
      const end = performance.now()
      const decodeMs = firstTokenAt ? end - firstTokenAt : 0
      this.lastStats = {
        tokens,
        promptTokens: 0, // not reported by wllama's streaming API
        ttftMs: firstTokenAt ? firstTokenAt - start : end - start,
        ms: end - start,
        tokensPerSecond: tokens > 1 && decodeMs > 0 ? (tokens - 1) / (decodeMs / 1000) : 0
      }
      this.busy = false
    }
  }
}
