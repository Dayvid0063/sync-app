import type { Device } from './types'

export type VariantKey = 'webgpu-f16' | 'webgpu' | 'wasm'

export interface ModelVariant {
  dtype: string
  /** Files fetched for this variant, relative to the repo root (prefetched into the cache). */
  files: string[]
  downloadBytes: number
  /** Override the repo config: false for single-file exports with weights inside the .onnx. */
  externalData?: boolean
}

export interface ModelSpec {
  id: string
  /** Short name shown in the UI. */
  label: string
  /** Pinned commit so upstream changes can't silently alter what users download. */
  revision: string
  /** Missing key = this model can't run on that kind of device. */
  variants: Partial<Record<VariantKey, ModelVariant>>
}

const GEMMA_SHARED = ['tokenizer.json', 'tokenizer_config.json', 'config.json', 'generation_config.json']

/**
 * Gemma 3 270M instruct. Chosen over Gemma 3 1B after real-device tests: the 1B model
 * downloaded fine but crashed (iPhone 14 Pro, Safari) or hung (4 GB Samsung) while
 * initialising on WebGPU — too much memory for a mobile browser tab.
 *
 * No WASM variant: every quantized export (q4, q4f16, quantized) uses
 * com.microsoft:GatherBlockQuantized for embeddings, which ORT's WASM backend doesn't
 * implement, and there is no int8 single-file export. Devices without WebGPU are
 * unsupported until we publish our own WASM-compatible export.
 */
export const GEMMA_3_270M: ModelSpec = {
  id: 'onnx-community/gemma-3-270m-it-ONNX',
  label: 'Gemma 3 270M',
  revision: '2dbbfdb1b59bd034eb959428c6a7da9dd7ea27f0',
  variants: {
    'webgpu-f16': {
      dtype: 'q4f16',
      files: [...GEMMA_SHARED, 'onnx/model_q4f16.onnx', 'onnx/model_q4f16.onnx_data'],
      downloadBytes: 294_000_000
    },
    'webgpu': {
      dtype: 'q4',
      files: [...GEMMA_SHARED, 'onnx/model_q4.onnx', 'onnx/model_q4.onnx_data'],
      downloadBytes: 344_000_000
    }
  }
}

export function variantKey(device: Device, shaderF16: boolean): VariantKey {
  if (device === 'wasm') return 'wasm'
  return shaderF16 ? 'webgpu-f16' : 'webgpu'
}

/** Same URL transformers.js uses as its Cache Storage key. */
export function fileUrl(spec: Pick<ModelSpec, 'id' | 'revision'>, file: string) {
  return `https://huggingface.co/${spec.id}/resolve/${spec.revision}/${file}`
}
