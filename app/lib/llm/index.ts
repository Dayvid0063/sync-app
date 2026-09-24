import { detectDevice, type DeviceCaps } from './device'
import { GEMMA_3_1B } from './models'
import { TransformersEngine } from './transformers-engine'
import type { LLMEngine } from './types'

export type * from './types'
export type { DeviceCaps } from './device'

/** The one place that decides which model and runtime the app uses. */
export async function createEngine(): Promise<{ engine: LLMEngine, caps: DeviceCaps }> {
  const caps = await detectDevice()
  return { engine: new TransformersEngine(GEMMA_3_1B, caps), caps }
}
