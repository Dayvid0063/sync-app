import type { ChatMessage, GenerateStats } from '~/lib/llm'
import { logEvent } from '~/lib/crashlog'

export interface UiMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  status: 'done' | 'streaming' | 'stopped' | 'error'
  error?: string
  stats?: GenerateStats
}

const SYSTEM_PROMPT = 'You are Afronet, a helpful assistant running offline on the user\'s phone. '
  + 'Answer clearly and concisely. Reply in the same language the user writes in.'

/** The conversation is saved on the device so it survives reloads and crashes. */
const STORAGE_KEY = 'afronet:chat'
const MAX_SAVED_MESSAGES = 60

function restore(): UiMessage[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as UiMessage[]
    // A reply that was still streaming when the page died is kept as "stopped".
    return saved.map(m => m.status === 'streaming' ? { ...m, status: 'stopped' as const } : m)
  }
  catch { return [] }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.value.slice(-MAX_SAVED_MESSAGES))) }
  catch { /* storage full or unavailable: the chat just won't survive a reload */ }
}

const messages = ref<UiMessage[]>(import.meta.client ? restore() : [])
const generating = ref(false)
let controller: AbortController | null = null
let nextId = messages.value.reduce((max, m) => Math.max(max, m.id), 0) + 1

/** Logs "still alive" checkpoints after a reply, to pin down crashes that happen shortly after one. */
let aliveTimers: ReturnType<typeof setTimeout>[] = []
function logAliveAfterReply() {
  aliveTimers.forEach(clearTimeout)
  aliveTimers = [2, 5, 10, 20].map(s => setTimeout(() => logEvent(`alive ${s}s after reply`), s * 1000))
}

/**
 * Conversation for the model: completed user/assistant pairs plus the new question.
 * Turns whose reply failed or came back empty are skipped so roles keep alternating.
 */
function buildHistory(question: string): ChatMessage[] {
  const history: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]
  const done = messages.value.slice(0, -2) // exclude the new user message + pending reply
  for (let i = 0; i + 1 < done.length; i++) {
    const user = done[i]!
    const reply = done[i + 1]!
    if (user.role === 'user' && reply.role === 'assistant' && reply.content.trim() && reply.status !== 'error') {
      history.push({ role: 'user', content: user.content }, { role: 'assistant', content: reply.content })
      i++
    }
  }
  history.push({ role: 'user', content: question })
  return history
}

async function send(text: string) {
  const question = text.trim()
  if (!question || generating.value) return

  const llm = useLLM()
  messages.value.push({ id: nextId++, role: 'user', content: question, status: 'done' })
  messages.value.push({ id: nextId++, role: 'assistant', content: '', status: 'streaming' })
  const reply = messages.value.at(-1)! // reactive proxy
  save()

  generating.value = true
  controller = new AbortController()
  logEvent(`question sent (${question.length} chars, ${messages.value.length} messages in chat)`)
  try {
    const engine = llm.engine()
    for await (const piece of engine.generate(buildHistory(question), { signal: controller.signal })) {
      reply.content += piece
    }
    reply.content = reply.content.trim()
    reply.status = controller.signal.aborted ? 'stopped' : 'done'
    reply.stats = engine.lastStats ?? undefined
    const s = reply.stats
    logEvent(`reply ${reply.status}${s ? `: ${s.tokens} tokens, prompt ${s.promptTokens}, ${s.tokensPerSecond.toFixed(1)} tok/s` : ''}`)
  }
  catch (err) {
    reply.status = 'error'
    reply.error = err instanceof Error ? err.message : String(err)
    logEvent(`reply error: ${reply.error}`)
  }
  finally {
    generating.value = false
    controller = null
    save()
    logAliveAfterReply()
  }
}

/** Re-asks the last question (used after an error). */
function retry() {
  const last = messages.value.at(-2)
  if (generating.value || last?.role !== 'user') return
  messages.value = messages.value.slice(0, -2)
  return send(last.content)
}

function stop() {
  controller?.abort()
}

function clear() {
  if (generating.value) return
  messages.value = []
  save()
  logEvent('new chat')
}

export function useChat() {
  return {
    messages: readonly(messages),
    generating: readonly(generating),
    send,
    retry,
    stop,
    clear
  }
}
