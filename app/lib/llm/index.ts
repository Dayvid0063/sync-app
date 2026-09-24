import { detectDevice, type DeviceCaps } from './device'
import { GEMMA_3_270M } from './models'
import { TransformersEngine, variantFor } from './transformers-engine'
import type { LLMEngine } from './types'

export type * from './types'
export type { DeviceCaps } from './device'

export const MODEL = GEMMA_3_270M

/**
 * The one place that decides which model and runtime the app uses.
 * `engine` is null when this device can't run the model (e.g. no WebGPU).
 */
export async function createEngine(): Promise<{ engine: LLMEngine | null, caps: DeviceCaps }> {
  const caps = await detectDevice()
  const engine = variantFor(MODEL, caps) ? new TransformersEngine(MODEL, caps) : null
  return { engine, caps }
}
