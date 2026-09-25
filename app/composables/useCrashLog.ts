import { startSession, type CrashReport } from '~/lib/crashlog'

// Started once per page load, before anything else logs.
const report = shallowRef<CrashReport | null>(import.meta.client ? startSession() : null)

/** The previous session's log, if it was killed while on screen (e.g. out of memory). */
export function useCrashLog() {
  return {
    report: readonly(report),
    dismiss: () => { report.value = null }
  }
}
