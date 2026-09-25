import type { Device } from './types'

export interface DeviceCaps {
  device: Device
  shaderF16: boolean
  /** Phones/tablets get tighter memory limits (shorter replies and history). */
  phone: boolean
  /** WebKit (Safari, and every browser on iOS): needs the recycle-worker-after-reply workaround. */
  webkit: boolean
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

/** Safari's engine. On iOS every browser uses it (Chrome there reports "CriOS", not "Chrome"). */
function isWebKit() {
  const ua = navigator.userAgent
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR|SamsungBrowser|Android/.test(ua)
}

/**
 * WebGPU when an adapter is available (f16 if supported), otherwise WASM/CPU.
 * `?device=wasm` in the URL forces the fallback path for testing.
 */
export async function detectDevice(): Promise<DeviceCaps> {
  const params = new URLSearchParams(location.search)
  const phone = isPhone()
  // ?recycle=1 forces the WebKit workaround on other browsers, for testing.
  const webkit = isWebKit() || params.get('recycle') === '1'
  const forced = params.get('device')
  if (forced === 'wasm') return { device: 'wasm', shaderF16: false, phone, webkit, reason: 'forced via ?device=wasm' }

  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<any> } }).gpu
  if (!gpu) return { device: 'wasm', shaderF16: false, phone, webkit, reason: 'WebGPU not available in this browser' }

  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) return { device: 'wasm', shaderF16: false, phone, webkit, reason: 'no WebGPU adapter' }
    const shaderF16 = adapter.features.has('shader-f16')
    return { device: 'webgpu', shaderF16, phone, webkit, reason: shaderF16 ? 'WebGPU with f16' : 'WebGPU without f16' }
  }
  catch {
    return { device: 'wasm', shaderF16: false, phone, webkit, reason: 'WebGPU adapter request failed' }
  }
}
