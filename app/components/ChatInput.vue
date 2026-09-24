<script setup lang="ts">
const props = defineProps<{ generating: boolean, disabled?: boolean }>()
const emit = defineEmits<{ send: [text: string], stop: [] }>()

const text = defineModel<string>({ default: '' })
const textarea = ref<HTMLTextAreaElement | null>(null)

// Grow with content up to ~6 lines.
function resize() {
  const el = textarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight + 2, 160)}px` // + borders (border-box)
}
watch(text, () => nextTick(resize))

function submit() {
  if (props.generating || props.disabled || !text.value.trim()) return
  emit('send', text.value)
  text.value = ''
}

// Enter sends on devices with a physical keyboard; on touch keyboards Enter adds a new line.
const touch = import.meta.client && matchMedia('(pointer: coarse)').matches
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !touch && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

defineExpose({ focus: () => textarea.value?.focus() })
</script>

<template>
  <form class="composer" @submit.prevent="submit">
    <textarea
      ref="textarea"
      v-model="text"
      rows="1"
      placeholder="Ask Afronet…"
      aria-label="Message"
      :disabled="disabled"
      enterkeyhint="send"
      @keydown="onKeydown"
    />
    <button v-if="generating" type="button" class="action stop" aria-label="Stop" @click="emit('stop')">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
    </button>
    <button v-else type="submit" class="action" aria-label="Send" :disabled="disabled || !text.trim()">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" fill="currentColor" /></svg>
    </button>
  </form>
</template>

<style scoped>
.composer {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  max-width: 44rem;
  margin: 0 auto;
  padding: 0.625rem 1rem;
  padding-bottom: max(0.625rem, env(safe-area-inset-bottom));
}

textarea {
  flex: 1;
  font: inherit;
  font-size: 1rem; /* ≥16px stops iOS zooming on focus */
  line-height: 1.4;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--border);
  border-radius: 1.25rem;
  background: var(--surface);
  color: var(--text);
  resize: none;
  box-sizing: border-box;
  max-height: 160px;
}
textarea:focus { outline: 2px solid var(--brand); outline-offset: -1px; }
textarea:disabled { opacity: 0.6; }

.action {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  cursor: pointer;
}
.action:disabled { opacity: 0.4; cursor: default; }
.action.stop { background: var(--text); color: var(--bg); }
</style>
