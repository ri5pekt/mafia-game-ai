<template>
  <div class="layout">
    <aside class="sidebar">
      <ChatPanel />
    </aside>

    <main class="main">
      <section class="tableShell">
        <div class="tableContainer">
          <div class="tableFallback" aria-hidden="true" />
          <img
            v-if="bgOk"
            class="tableBg"
            :src="gameBgUrl"
            alt="Game table"
            @error="bgOk = false"
          />

          <PlayerAvatar
            v-for="p in players"
            :key="p.id"
            :initials="p.initials"
            :name="p.name"
            :top="p.top"
            :left="p.left"
          />

          <PlayerAvatar
            initials="HOST"
            name="HOST"
            :top="host.top"
            :left="host.left"
            is-host
          />
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import ChatPanel from '@/components/ChatPanel.vue';
import PlayerAvatar from '@/components/PlayerAvatar.vue';
import { ref } from 'vue';

type PlayerViewModel = {
  id: string;
  initials: string;
  name: string;
  top: string;
  left: string;
};

// Important: we keep this as a static path so the UI still boots even if
// `apps/web/src/assets/game-bg.png` hasn't been added yet (it will just 404).
const gameBgUrl = '/src/assets/game-bg.png';
const bgOk = ref(true);

const players: PlayerViewModel[] = [
  { id: 'P1', initials: 'P1', name: 'Player 1', top: '12%', left: '50%' },
  { id: 'P2', initials: 'P2', name: 'Player 2', top: '18%', left: '70%' },
  { id: 'P3', initials: 'P3', name: 'Player 3', top: '35%', left: '82%' },
  { id: 'P4', initials: 'P4', name: 'Player 4', top: '55%', left: '82%' },
  { id: 'P5', initials: 'P5', name: 'Player 5', top: '72%', left: '70%' },
  { id: 'P6', initials: 'P6', name: 'Player 6', top: '78%', left: '50%' },
  { id: 'P7', initials: 'P7', name: 'Player 7', top: '72%', left: '30%' },
  { id: 'P8', initials: 'P8', name: 'Player 8', top: '55%', left: '18%' },
  { id: 'P9', initials: 'P9', name: 'Player 9', top: '35%', left: '18%' },
  { id: 'P10', initials: 'P10', name: 'Player 10', top: '18%', left: '30%' }
];

const host = { top: '90%', left: '50%' };
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  width: 100%;
}

.sidebar {
  width: 320px;
  min-width: 320px;
  padding: 12px;
  box-sizing: border-box;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(12, 16, 32, 0.9);
}

.main {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 16px;
  box-sizing: border-box;
}

.tableShell {
  width: min(1100px, 100%);
}

.tableContainer {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
}

.tableFallback {
  position: absolute;
  inset: 0;
  border-radius: 18px;
  background:
    radial-gradient(800px 400px at 50% 40%, rgba(34, 197, 94, 0.18), transparent 55%),
    radial-gradient(900px 500px at 50% 55%, rgba(59, 130, 246, 0.16), transparent 60%),
    radial-gradient(600px 300px at 50% 65%, rgba(0, 0, 0, 0.35), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0));
  border: 1px solid rgba(255, 255, 255, 0.10);
  filter: drop-shadow(0 16px 40px rgba(0, 0, 0, 0.55));
}

.tableBg {
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  pointer-events: none;
  filter: drop-shadow(0 16px 40px rgba(0, 0, 0, 0.55));
}
</style>


