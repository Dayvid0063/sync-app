/// <reference lib="webworker" />
// Runs the model off the main thread so the UI stays responsive on low-end phones.
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  InterruptableStoppingCriteria,
  TextStreamer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer
} from '@huggingface/transformers'
// Self-hosted ONNX Runtime: Vite emits these as hashed assets (precached by the SW),
// instead of transformers.js fetching them from a CDN, which would break offline.
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import type { ChatMessage } from './types'
import { CACHE_NAME, type FromWorker, type ToWorker, type WorkerLoadConfig } from './protocol'
import { fileUrl } from './models'

/** Prompt budget. Older turns are dropped beyond this to bound memory and latency. */
const MAX_PROMPT_TOKENS = 1536

const post = (msg: FromWorker) => self.postMessage(msg)

let tokenizer: PreTrainedTokenizer | null = null
let model: PreTrainedModel | null = null
const stopping = new InterruptableStoppingCriteria()

function configureRuntime(config: WorkerLoadConfig) {
  env.allowLocalModels = false
  env.useBrowserCache = true
  // Bake the pinned commit into every URL. transformers.js 4.3.0 checks tokenizer_config.json
  // without passing `revision` (so it asks for `main`), which misses the cache and breaks offline.
  env.remotePathTemplate = `{model}/resolve/${config.revision}/`
  // The service worker precaches the ORT files; no need for transformers.js to cache them again.
  env.useWasmCache = false
  env.backends.onnx.wasm!.wasmPaths = {
    mjs: new URL(ortMjsUrl, self.location.href).href,
    wasm: new URL(ortWasmUrl, self.location.href).href
  }
}

/** Files above this are streamed into the cache instead of being buffered in memory. */
const STREAM_THRESHOLD = 32 * 1024 * 1024

/**
 * Downloads every model file into transformers.js's cache before it loads anything.
 * - Large files stream straight to Cache Storage, so the download never holds the whole
 *   model in memory (the in-memory approach crashed phones).
 * - Each cache entry is written in one `put`, which only succeeds for a complete body, and
 *   carries an exact Content-Length (transformers.js sizes its read buffer from it).
 * - Files already cached are skipped, so an interrupted setup never re-downloads them.
 */
async function prefetch(config: WorkerLoadConfig) {
  const cache = await caches.open(CACHE_NAME)
  let loaded = 0
  const report = () => post({
    type: 'progress',
    progress: {
      phase: 'download',
      loaded,
      total: config.downloadBytes,
      percent: Math.min(99, (loaded / config.downloadBytes) * 100)
    }
  })

  for (const file of config.files) {
    const url = fileUrl(config, file)
    const cached = await cache.match(url)
    if (cached) {
      loaded += Number(cached.headers.get('content-length') ?? 0)
      report()
      continue
    }

    const res = await fetch(url)
    if (!res.ok || !res.body) throw new Error(`Download failed for ${file} (HTTP ${res.status})`)
    const expected = Number(res.headers.get('content-length') ?? 0)
    const headers = new Headers({ 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' })

    if (expected > STREAM_THRESHOLD) {
      let received = 0
      const counter = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, ctl) {
          received += chunk.byteLength
          loaded += chunk.byteLength
          report()
          ctl.enqueue(chunk)
        }
      })
      headers.set('content-length', String(expected))
      await cache.put(url, new Response(res.body.pipeThrough(counter), { headers }))
      if (received !== expected) {
        await cache.delete(url)
        throw new Error(`Download of ${file} was incomplete (${received} of ${expected} bytes)`)
      }
    }
    else {
      // Small files (configs, tokenizer): buffer, so the stored length is exact even when the
      // server compressed the transfer.
      const chunks: Uint8Array[] = []
      const reader = res.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.byteLength
        report()
      }
      const body = new Blob(chunks as BlobPart[])
      headers.set('content-length', String(body.size))
      await cache.put(url, new Response(body, { headers }))
    }
  }
}

async function load(config: WorkerLoadConfig) {
  configureRuntime(config)
  await prefetch(config)

  // From here transformers.js reads only from the cache.
  post({ type: 'progress', progress: { phase: 'init', loaded: config.downloadBytes, total: config.downloadBytes, percent: 100 } })

  const opts = { revision: config.revision }
  tokenizer = await AutoTokenizer.from_pretrained(config.id, opts)
  model = await AutoModelForCausalLM.from_pretrained(config.id, {
    ...opts,
    dtype: config.dtype as any,
    device: config.device,
    ...(config.externalData !== undefined && { use_external_data_format: config.externalData })
  })

  // ORT's WASM backend completes each step with microtasks only, so a queued 'interrupt'
  // message would not run until generation ended. Yield one macrotask per step so Stop works.
  const forward = model.forward.bind(model)
  model.forward = async (inputs: any) => {
    await yieldToEventLoop()
    return forward(inputs)
  }

  // WebGPU compiles shaders on first run; do it now rather than on the user's first question.
  if (config.device === 'webgpu') {
    const warm = tokenizer('a', { return_tensor: true }) as any
    await model.generate({ ...warm, max_new_tokens: 1 })
  }
}

/** Drops the oldest user/assistant pairs until the prompt fits the token budget. */
function fitToBudget(messages: ChatMessage[]) {
  const system = messages[0]?.role === 'system' ? [messages[0]] : []
  let turns = messages.slice(system.length)

  const count = (msgs: ChatMessage[]) =>
    (tokenizer!.apply_chat_template(msgs, { add_generation_prompt: true, tokenize: true, return_tensor: false }) as unknown as number[]).length

  let tokens = count([...system, ...turns])
  while (tokens > MAX_PROMPT_TOKENS && turns.length > 1) {
    turns = turns.slice(2)
    tokens = count([...system, ...turns])
  }
  return [...system, ...turns]
}

async function generate(id: number, messages: ChatMessage[], maxNewTokens: number) {
  if (!tokenizer || !model) throw new Error('Model is not loaded')

  const inputs = tokenizer.apply_chat_template(fitToBudget(messages), {
    add_generation_prompt: true,
    return_dict: true
  }) as any
  const promptTokens: number = inputs.input_ids.dims.at(-1)

  let tokens = 0
  let firstTokenAt = 0
  const start = performance.now()

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => { if (text) post({ type: 'token', id, text }) },
    token_callback_function: () => {
      if (tokens++ === 0) firstTokenAt = performance.now()
    }
  })

  stopping.reset()
  await model.generate({
    ...inputs,
    max_new_tokens: maxNewTokens,
    do_sample: true,
    temperature: 0.7,
    top_k: 64,
    top_p: 0.95,
    repetition_penalty: 1.1,
    streamer,
    stopping_criteria: stopping as any
  })

  const end = performance.now()
  const decodeMs = firstTokenAt ? end - firstTokenAt : 0
  post({
    type: 'done',
    id,
    stats: {
      tokens,
      promptTokens,
      ttftMs: firstTokenAt ? firstTokenAt - start : end - start,
      ms: end - start,
      tokensPerSecond: tokens > 1 && decodeMs > 0 ? (tokens - 1) / (decodeMs / 1000) : 0
    }
  })
}

// Load/generate run strictly one after another; interrupt must bypass the queue.
let queue = Promise.resolve()
const enqueue = (task: () => Promise<void>) => { queue = queue.then(task) }

self.addEventListener('message', (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  switch (msg.type) {
    case 'load':
      enqueue(async () => {
        try {
          await load(msg.config)
          post({ type: 'ready' })
        }
        catch (err) {
          post({ type: 'load-error', message: errorMessage(err) })
        }
      })
      break
    case 'generate':
      enqueue(async () => {
        try {
          await generate(msg.id, msg.messages, msg.maxNewTokens)
        }
        catch (err) {
          post({ type: 'generate-error', id: msg.id, message: errorMessage(err) })
        }
      })
      break
    case 'interrupt':
      stopping.interrupt()
      break
  }
})

/** Resolves after pending tasks (e.g. incoming worker messages) have run. */
function yieldToEventLoop() {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => resolve()
    channel.port2.postMessage(null)
  })
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}
