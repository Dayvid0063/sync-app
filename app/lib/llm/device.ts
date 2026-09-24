import type { Device } from './types'

export interface DeviceCaps {
  device: Device
  shaderF16: boolean
  /** Why this device was chosen — shown in the debug panel. */
  reason: string
}

/**
 * WebGPU when an adapter is available (f16 if supported), otherwise WASM/CPU.
 * `?device=wasm` in the URL forces the fallback path for testing.
 */
export async function detectDevice(): Promise<DeviceCaps> {
  const forced = new URLSearchParams(location.search).get('device')
  if (forced === 'wasm') return { device: 'wasm', shaderF16: false, reason: 'forced via ?device=wasm' }

  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<any> } }).gpu
  if (!gpu) return { device: 'wasm', shaderF16: false, reason: 'WebGPU not available in this browser' }

  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) return { device: 'wasm', shaderF16: false, reason: 'no WebGPU adapter' }
    const shaderF16 = adapter.features.has('shader-f16')
    return { device: 'webgpu', shaderF16, reason: shaderF16 ? 'WebGPU with f16' : 'WebGPU without f16' }
  }
  catch {
    return { device: 'wasm', shaderF16: false, reason: 'WebGPU adapter request failed' }
  }
}
