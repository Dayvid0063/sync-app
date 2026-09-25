// Crash detection + a small persistent event log.
//
// Phone browsers (notably iOS) kill a page that uses too much memory without any error the
// page can catch, and there are no logs to read afterwards. So we keep the last few events in
// localStorage (which survives the kill) and note whether the page was on screen. On the next
// launch, "was on screen and never closed normally" means it was killed.

const LOG_KEY = 'afronet:log'
const SESSION_KEY = 'afronet:session'
const MAX_LINES = 150

interface SessionState {
  startedAt: number
  /** True while the page is on screen; set false on hide/close (a normal exit). */
  visible: boolean
}

export interface CrashReport {
  /** Events from the session that ended unexpectedly, oldest first. */
  lines: string[]
  /** The last event logged before the page was killed. */
  lastEvent: string | null
}

let lines: string[] = []

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  }
  catch { return null }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) }
  catch { /* storage full or unavailable: logging is best-effort */ }
}

/** Appends a timestamped line to the persistent log. Use for milestones, not per token. */
export function logEvent(message: string) {
  const time = new Date().toISOString().slice(11, 23)
  lines.push(`${time} ${message}`)
  if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES)
  write(LOG_KEY, lines)
}

function setVisible(visible: boolean) {
  const session = read<SessionState>(SESSION_KEY)
  if (session) write(SESSION_KEY, { ...session, visible })
}

/**
 * Call once at startup. Returns a report if the previous session was killed while on screen,
 * then starts a new session log.
 */
export function startSession(): CrashReport | null {
  const previous = read<SessionState>(SESSION_KEY)
  const previousLines = read<string[]>(LOG_KEY) ?? []
  const crashed = previous?.visible === true

  lines = []
  write(SESSION_KEY, { startedAt: Date.now(), visible: document.visibilityState === 'visible' } satisfies SessionState)
  logEvent(`app start · ${navigator.userAgent}`)
  if (crashed) logEvent('previous session ended unexpectedly while on screen')

  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible'
    setVisible(visible)
    logEvent(visible ? 'shown' : 'hidden')
  })
  // Normal closes, reloads and navigations fire pagehide; a memory kill does not.
  window.addEventListener('pagehide', () => {
    logEvent('page closed normally')
    setVisible(false)
  })

  return crashed ? { lines: previousLines, lastEvent: previousLines.at(-1) ?? null } : null
}
