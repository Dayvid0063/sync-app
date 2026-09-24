import type { ChatMessage, GenerateStats } from '~/lib/llm'

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

// One conversation per app session, kept in memory.
const messages = ref<UiMessage[]>([])
const generating = ref(false)
let controller: AbortController | null = null
let nextId = 1

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

  generating.value = true
  controller = new AbortController()
  try {
    const engine = llm.engine()
    for await (const piece of engine.generate(buildHistory(question), { signal: controller.signal })) {
      reply.content += piece
    }
    reply.content = reply.content.trim()
    reply.status = controller.signal.aborted ? 'stopped' : 'done'
    reply.stats = engine.lastStats ?? undefined
  }
  catch (err) {
    reply.status = 'error'
    reply.error = err instanceof Error ? err.message : String(err)
  }
  finally {
    generating.value = false
    controller = null
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
