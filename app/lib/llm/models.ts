import type { Device } from './types'

export interface ModelVariant {
  dtype: string
  /** Files fetched for this variant, relative to the repo root (used for cache checks). */
  files: string[]
  downloadBytes: number
  /** Override the repo config: false for single-file exports with weights inside the .onnx. */
  externalData?: boolean
}

export interface ModelSpec {
  id: string
  /** Pinned commit so upstream changes can't silently alter what users download. */
  revision: string
  variants: Record<'webgpu-f16' | 'webgpu' | 'wasm', ModelVariant>
}

const GEMMA_SHARED = ['tokenizer.json', 'tokenizer_config.json', 'config.json', 'generation_config.json']

export const GEMMA_3_1B: ModelSpec = {
  id: 'onnx-community/gemma-3-1b-it-ONNX',
  revision: 'a58439f40017d3b99c7d378ff525e54e0ba08ebf',
  variants: {
    'webgpu-f16': {
      dtype: 'q4f16',
      files: [...GEMMA_SHARED, 'onnx/model_q4f16.onnx', 'onnx/model_q4f16.onnx_data'],
      downloadBytes: 783_000_000
    },
    'webgpu': {
      dtype: 'q4',
      files: [...GEMMA_SHARED, 'onnx/model_q4.onnx', 'onnx/model_q4.onnx_data'],
      downloadBytes: 879_000_000
    },
    // The q4/q4f16/quantized exports use GatherBlockQuantized for embeddings, which the
    // ORT WASM backend does not implement. The older single-file int8 export uses only
    // standard ops (MatMulInteger, DynamicQuantizeLinear, Gather).
    'wasm': {
      dtype: 'int8',
      files: [...GEMMA_SHARED, 'onnx/model_int8.onnx'],
      downloadBytes: 1_021_000_000,
      externalData: false
    }
  }
}

export function variantKey(device: Device, shaderF16: boolean): keyof ModelSpec['variants'] {
  if (device === 'wasm') return 'wasm'
  return shaderF16 ? 'webgpu-f16' : 'webgpu'
}

/** Same URL transformers.js uses as its Cache Storage key. */
export function fileUrl(spec: ModelSpec, file: string) {
  return `https://huggingface.co/${spec.id}/resolve/${spec.revision}/${file}`
}
