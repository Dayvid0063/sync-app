<script setup lang="ts">
const llm = useLLM()
const chat = useChat()
const draft = ref('')
const input = ref<{ focus: () => void } | null>(null)

// Model already on the device → start it straight away; a download always waits for a tap.
// After an interrupted setup (likely a memory crash) wait for a tap too, to avoid a crash loop.
watch(llm.status, (s) => { if (s === 'cached' && !llm.interrupted.value) llm.load() }, { immediate: true })

const ready = computed(() => llm.status.value === 'ready')

function useSuggestion(text: string) {
  draft.value = text
  input.value?.focus()
}
</script>

<template>
  <div class="chat">
    <Teleport defer to="#header-actions">
      <button
        v-if="chat.messages.value.length"
        type="button"
        class="new-chat"
        :disabled="chat.generating.value"
        @click="chat.clear()"
      >
        New chat
      </button>
    </Teleport>

    <CrashNotice />

    <template v-if="ready">
      <ChatMessageList :messages="chat.messages.value" @suggest="useSuggestion" @retry="chat.retry()" />
      <div class="dock">
        <ChatInput
          ref="input"
          v-model="draft"
          :generating="chat.generating.value"
          @send="chat.send"
          @stop="chat.stop()"
        />
        <p v-if="llm.info.value" class="runtime">
          Runs on your device · {{ llm.info.value.device === 'webgpu' ? 'GPU' : 'CPU' }}
        </p>
      </div>
    </template>

    <div v-else class="setup-wrap">
      <ModelLoadProgress />
    </div>
  </div>
</template>

<style scoped>
.chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.dock {
  border-top: 1px solid var(--border);
  background: var(--bg);
}

.runtime {
  margin: -0.25rem 0 0;
  padding-bottom: max(0.375rem, env(safe-area-inset-bottom));
  text-align: center;
  font-size: 0.6875rem;
  color: var(--muted);
}

.setup-wrap {
  flex: 1;
  display: flex;
  padding: 1rem;
  overflow-y: auto;
}

.new-chat {
  font: inherit;
  font-size: 0.875rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid rgb(255 255 255 / 0.4);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.new-chat:disabled { opacity: 0.5; }
</style>
