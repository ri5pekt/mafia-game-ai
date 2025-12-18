<template>
  <Card class="chatCard">
    <template #title>Chat / Events</template>
    <template #content>
      <ScrollPanel class="scroll">
        <div class="messages">
          <div v-for="m in resolvedMessages" :key="m.id" class="message">
            <div class="meta">
              <span class="sender" :class="m.kind">{{ m.sender }}</span>
              <span class="dot">•</span>
              <span class="time">{{ m.time }}</span>
            </div>
            <div class="text">{{ m.text }}</div>
          </div>
        </div>
      </ScrollPanel>

      <Divider />

      <div class="composer">
        <InputText class="input" v-model="draft" placeholder="Type a message (placeholder)" />
        <Button label="Send" :disabled="true" />
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ChatMessage } from "@/types/chat";

const props = defineProps<{
  messages?: ChatMessage[];
}>();

const draft = ref('');

const fallbackMessages = ref<ChatMessage[]>([
  { id: "m1", kind: "system", sender: "SYSTEM", time: "00:00", text: "Lobby created." },
  { id: "m2", kind: "host", sender: "HOST", time: "00:01", text: "Welcome. AI players will join soon." },
  { id: "m3", kind: "system", sender: "SYSTEM", time: "00:02", text: "Press Start Game to begin." },
]);

const resolvedMessages = computed(() => props.messages ?? fallbackMessages.value);
</script>

<style scoped>
.chatCard {
  height: 100%;
  background: rgba(12, 16, 32, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.92);
}

.chatCard :deep(.p-card-body),
.chatCard :deep(.p-card-content),
.chatCard :deep(.p-card-caption),
.chatCard :deep(.p-card-title) {
  color: rgba(255, 255, 255, 0.92);
}

.chatCard :deep(.p-card-subtitle) {
  color: rgba(255, 255, 255, 0.65);
}

.chatCard :deep(.p-divider) {
  border-color: rgba(255, 255, 255, 0.10);
}

.chatCard :deep(.p-inputtext) {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.92);
}

.chatCard :deep(.p-inputtext::placeholder) {
  color: rgba(255, 255, 255, 0.55);
}

.scroll {
  height: calc(100vh - 220px);
  min-height: 360px;
}

.messages {
  display: grid;
  gap: 10px;
  padding-right: 6px;
}

.message {
  padding: 10px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  opacity: 0.9;
  margin-bottom: 6px;
}

.sender {
  font-weight: 700;
}

.sender.host {
  color: #a7f3d0;
}

.sender.player {
  color: #93c5fd;
}

.sender.system {
  color: #fcd34d;
}

.dot,
.time {
  color: rgba(255, 255, 255, 0.55);
}

.text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.88);
  line-height: 1.35;
  white-space: pre-line;
}

.composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.input {
  width: 100%;
}
</style>


