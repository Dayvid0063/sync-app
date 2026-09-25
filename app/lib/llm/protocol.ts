import type { ChatMessage, Device, GenerateStats, LoadProgress } from './types'

/** Messages between TransformersEngine (main thread) and transformers.worker.ts. */

/** Cache Storage bucket transformers.js reads model files from (its default `env.cacheKey`). */
export const CACHE_NAME = 'transformers-cache'

export interface WorkerLoadConfig {
  id: string
  revision: string
  device: Device
  dtype: string
  /** Repo-relative files to prefetch into the cache. */
  files: string[]
  downloadBytes: number
  externalData?: boolean
  /** Max prompt tokens; older turns are dropped beyond it. */
  promptBudget: number
}

export type ToWorker =
  | { type: 'load', config: WorkerLoadConfig }
  | { type: 'generate', id: number, messages: ChatMessage[], maxNewTokens: number }
  | { type: 'interrupt' }

export type FromWorker =
  | { type: 'progress', progress: LoadProgress }
  | { type: 'ready' }
  | { type: 'load-error', message: string }
  | { type: 'token', id: number, text: string }
  | { type: 'done', id: number, stats: GenerateStats }
  | { type: 'generate-error', id: number, message: string }
