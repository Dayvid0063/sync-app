import type { Device } from './types'

export interface DeviceCaps {
  device: Device
  shaderF16: boolean
  /** Phones/tablets get tighter memory limits (shorter replies and history). */
  phone: boolean
  /** Why this device was chosen — shown in the debug panel. */
  reason: string
}

/** Phones and tablets, including iPads that report a desktop user agent. */
function isPhone() {
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (uaData?.mobile) return true
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true
  return /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1
}

/**
 * WebGPU when an adapter is available (f16 if supported), otherwise WASM/CPU.
 * `?device=wasm` in the URL forces the fallback path for testing.
 */
export async function detectDevice(): Promise<DeviceCaps> {
  const phone = isPhone()
  const forced = new URLSearchParams(location.search).get('device')
  if (forced === 'wasm') return { device: 'wasm', shaderF16: false, phone, reason: 'forced via ?device=wasm' }

  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<any> } }).gpu
  if (!gpu) return { device: 'wasm', shaderF16: false, phone, reason: 'WebGPU not available in this browser' }

  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) return { device: 'wasm', shaderF16: false, phone, reason: 'no WebGPU adapter' }
    const shaderF16 = adapter.features.has('shader-f16')
    return { device: 'webgpu', shaderF16, phone, reason: shaderF16 ? 'WebGPU with f16' : 'WebGPU without f16' }
  }
  catch {
    return { device: 'wasm', shaderF16: false, phone, reason: 'WebGPU adapter request failed' }
  }
}
