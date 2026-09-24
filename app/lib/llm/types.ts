export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export type LoadPhase = 'download' | 'init'

export interface LoadProgress {
  phase: LoadPhase
  /** Bytes received so far (download phase). */
  loaded: number
  /** Expected total bytes (download phase). */
  total: number
  /** 0–100 */
  percent: number
}

export interface GenerateOptions {
  maxNewTokens?: number
  signal?: AbortSignal
}

export interface GenerateStats {
  tokens: number
  /** Prompt tokens actually sent (after trimming old history). */
  promptTokens: number
  /** Time to first token (prompt processing). */
  ttftMs: number
  ms: number
  /** Decode speed, excluding prompt processing. */
  tokensPerSecond: number
}

export type Device = 'webgpu' | 'wasm'

export interface EngineInfo {
  modelId: string
  device: Device
  dtype: string
  /** Approximate download size in bytes for the selected variant. */
  downloadBytes: number
}

/**
 * The only surface the UI talks to. Swapping model or runtime means writing a new
 * implementation of this interface and returning it from `createEngine()`.
 */
export interface LLMEngine {
  readonly info: EngineInfo
  /** Downloads (first run) or loads from cache, then initialises the model. */
  load(onProgress?: (p: LoadProgress) => void): Promise<void>
  /** Streams the assistant reply for the conversation, piece by piece. */
  generate(messages: ChatMessage[], opts?: GenerateOptions): AsyncIterable<string>
  /** Whether model files are already stored on this device (no download needed). */
  isCached(): Promise<boolean>
  /** Stats for the most recent completed generation. */
  readonly lastStats: GenerateStats | null
}
