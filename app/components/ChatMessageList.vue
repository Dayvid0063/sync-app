<script setup lang="ts">
import type { UiMessage } from '~/composables/useChat'
import { renderMarkdown } from '~/lib/markdown'

const props = defineProps<{ messages: readonly UiMessage[] }>()
const emit = defineEmits<{ suggest: [text: string], retry: [] }>()

const suggestions = [
  'How can I make water safe to drink?',
  'Nipe vidokezo vya kuandika CV nzuri.',
  'Explain how to start a small poultry business.'
]

// Follow the stream unless the user has scrolled up to read.
const scroller = ref<HTMLElement | null>(null)
let pinned = true
function onScroll() {
  const el = scroller.value!
  pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 48
}
watch(
  () => [props.messages.length, props.messages.at(-1)?.content],
  async () => {
    if (!pinned) return
    await nextTick()
    scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
  }
)
watch(() => props.messages.length, () => { pinned = true })
</script>

<template>
  <div ref="scroller" class="scroller" @scroll.passive="onScroll">
    <div class="list">
      <div v-if="!messages.length" class="empty">
        <p>Ask anything. Everything stays on your device.</p>
        <button v-for="s in suggestions" :key="s" type="button" class="suggestion" @click="emit('suggest', s)">
          {{ s }}
        </button>
      </div>

      <article v-for="m in messages" :key="m.id" class="msg" :class="m.role">
        <div v-if="m.role === 'user'" class="bubble">{{ m.content }}</div>

        <div v-else class="bubble">
          <div v-if="m.content" class="md" v-html="renderMarkdown(m.content)" />
          <span v-if="m.status === 'streaming'" class="typing" :class="{ alone: !m.content }" aria-label="Thinking">
            <i /><i /><i />
          </span>
          <p v-if="m.status === 'stopped'" class="note">Stopped</p>
          <p v-if="m.status === 'error'" class="note error">
            Couldn't answer: {{ m.error }}
            <button type="button" class="link" @click="emit('retry')">Try again</button>
          </p>
          <p v-if="m.stats && m.status === 'done'" class="stats">
            {{ m.stats.tokensPerSecond.toFixed(1) }} tok/s · first word in {{ (m.stats.ttftMs / 1000).toFixed(1) }}s
          </p>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.scroller {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 44rem;
  margin: 0 auto;
  padding: 1rem;
}

.empty {
  display: grid;
  gap: 0.5rem;
  margin-top: 2rem;
  text-align: center;
  color: var(--muted);
}
.empty p { margin: 0 0 0.5rem; }

.suggestion {
  font: inherit;
  text-align: left;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}

.msg { display: flex; }
.msg.user { justify-content: flex-end; }

.bubble {
  max-width: 85%;
  padding: 0.625rem 0.875rem;
  border-radius: 1rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.user .bubble {
  background: var(--bubble);
  color: #fff;
  border-bottom-right-radius: 0.25rem;
  white-space: pre-wrap;
}
.assistant .bubble {
  background: var(--surface);
  border: 1px solid var(--border);
  border-bottom-left-radius: 0.25rem;
}

.md :deep(p), .md :deep(ul), .md :deep(ol), .md :deep(pre) { margin: 0 0 0.5rem; }
.md :deep(> :last-child) { margin-bottom: 0; }
.md :deep(ul), .md :deep(ol) { padding-left: 1.25rem; }
.md :deep(h3), .md :deep(h4), .md :deep(h5), .md :deep(h6) { margin: 0.25rem 0 0.375rem; font-size: 1rem; }
.md :deep(code) { font-size: 0.875em; background: var(--code); padding: 0.1em 0.3em; border-radius: 0.25rem; }
.md :deep(pre) { background: var(--code); padding: 0.625rem; border-radius: 0.5rem; overflow-x: auto; }
.md :deep(pre code) { background: none; padding: 0; }

.typing { display: inline-flex; gap: 0.25rem; vertical-align: middle; margin-left: 0.25rem; }
.typing.alone { margin-left: 0; padding: 0.375rem 0; }
.typing i {
  width: 0.375rem; height: 0.375rem; border-radius: 50%;
  background: var(--muted);
  animation: pulse 1.2s infinite ease-in-out;
}
.typing i:nth-child(2) { animation-delay: 0.15s; }
.typing i:nth-child(3) { animation-delay: 0.3s; }
@keyframes pulse { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }

.note { margin: 0.375rem 0 0; font-size: 0.8125rem; color: var(--muted); font-style: italic; }
.note.error { color: var(--danger); font-style: normal; }
.link { font: inherit; background: none; border: 0; padding: 0; color: var(--brand); text-decoration: underline; cursor: pointer; }
.stats { margin: 0.375rem 0 0; font-size: 0.75rem; color: var(--muted); }
</style>
