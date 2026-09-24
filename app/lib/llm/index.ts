import { detectDevice, type DeviceCaps } from './device'
import { WllamaEngine, type GgufModelSpec } from './wllama-engine'
import type { LLMEngine } from './types'

export type * from './types'
export type { DeviceCaps } from './device'

/**
 * Gemma 3 270M instruct, Q4_K_M GGUF (unsloth) — the same file wllama's demo defaults to for
 * phones. Pinned to a commit so upstream changes can't alter what users download.
 */
export const MODEL: GgufModelSpec = {
  label: 'Gemma 3 270M',
  url: 'https://huggingface.co/unsloth/gemma-3-270m-it-GGUF/resolve/c90975dbd40c0c7b275fefaae758c3415c906238/gemma-3-270m-it-Q4_K_M.gguf',
  quant: 'Q4_K_M',
  downloadBytes: 253_115_424,
  contextTokens: 2048
}

/**
 * The one place that decides which model and runtime the app uses.
 * `engine` is null when this device can't run the model at all.
 * (The previous transformers.js engine is kept in transformers-engine.ts for comparison.)
 */
export async function createEngine(): Promise<{ engine: LLMEngine | null, caps: DeviceCaps }> {
  const caps = await detectDevice()
  // llama.cpp also runs on CPU, so every device with WebAssembly is supported.
  const engine = typeof WebAssembly === 'object' ? new WllamaEngine(MODEL, caps) : null
  return { engine, caps }
}
