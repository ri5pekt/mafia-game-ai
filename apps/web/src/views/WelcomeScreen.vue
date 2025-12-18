<template>
  <div class="wrap">
    <Card class="card">
      <template #title>AI-Driven Mafia Game</template>
      <template #subtitle>Welcome — configure a few basics, then start.</template>

      <template #content>
        <div class="form">
          <div class="row">
            <label class="label" for="roomName">Room name</label>
            <InputText id="roomName" v-model="roomName" placeholder="e.g. Friday Night Mafia" />
          </div>

          <div class="row">
            <label class="label" for="playerCount">Players</label>
            <InputText id="playerCount" v-model="playerCount" disabled />
            <small class="hint">v1 is designed for 10 AI players + HOST.</small>
          </div>

          <Divider />

          <div class="row">
            <div class="label">Notes</div>
            <div class="notes">
              <div>- Backend containers can run independently; UI works offline.</div>
              <div>- Roles are not revealed on death; revealed only at game end.</div>
              <div>- This screen is a placeholder; we’ll expand settings later.</div>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="footer">
          <Button label="Start Game" @click="confirmOpen = true" />
        </div>
      </template>
    </Card>

    <Dialog v-model:visible="confirmOpen" modal header="Start Game?" :style="{ width: '420px' }">
      <div class="confirmBody">
        This will enter the game table screen. Gameplay logic is not implemented yet.
      </div>
      <template #footer>
        <div class="dialogFooter">
          <Button label="Cancel" severity="secondary" @click="confirmOpen = false" />
          <Button label="Start" @click="start()" />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  (e: 'start'): void;
}>();

const roomName = ref('Mafia Table');
const playerCount = ref('10 AI players');

const confirmOpen = ref(false);

function start() {
  confirmOpen.value = false;
  emit('start');
}
</script>

<style scoped>
.wrap {
  height: 100vh;
  display: grid;
  place-items: center;
  padding: 18px;
  box-sizing: border-box;
}

.card {
  width: min(640px, 100%);
}

.form {
  display: grid;
  gap: 14px;
}

.row {
  display: grid;
  gap: 8px;
}

.label {
  font-size: 12px;
  opacity: 0.85;
}

.hint {
  opacity: 0.7;
}

.notes {
  display: grid;
  gap: 6px;
  font-size: 13px;
  opacity: 0.9;
}

.footer {
  display: flex;
  justify-content: flex-end;
}

.confirmBody {
  line-height: 1.4;
  opacity: 0.9;
}

.dialogFooter {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>


