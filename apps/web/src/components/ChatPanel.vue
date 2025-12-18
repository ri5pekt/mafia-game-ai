<template>
  <Card class="chatCard">
    <template #title>Chat / Events</template>
    <template #content>
      <ScrollPanel class="scroll">
        <div class="messages">
          <div v-for="m in messages" :key="m.id" class="message">
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
import { ref } from 'vue';

type MessageKind = 'host' | 'player' | 'system';

type Message = {
  id: string;
  kind: MessageKind;
  sender: string;
  time: string;
  text: string;
};

const draft = ref('');

const messages = ref<Message[]>([
  { id: 'm1', kind: 'system', sender: 'SYSTEM', time: '00:00', text: 'Lobby created.' },
  { id: 'm2', kind: 'host', sender: 'HOST', time: '00:01', text: 'Welcome. AI players will join soon.' },
  { id: 'm3', kind: 'player', sender: 'P3', time: '00:02', text: 'Hello everyone.' },
  { id: 'm4', kind: 'player', sender: 'P7', time: '00:03', text: 'Ready when you are.' },
  { id: 'm5', kind: 'system', sender: 'SYSTEM', time: '00:04', text: 'Game phase: DAY (placeholder).' }
]);
</script>

<style scoped>
.chatCard {
  height: 100%;
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


