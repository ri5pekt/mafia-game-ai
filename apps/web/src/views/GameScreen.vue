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
            :nickname="p.nickname"
            :avatar-url="p.avatarUrl"
            :top="p.top"
            :left="p.left"
          />

          <PlayerAvatar
            :initials="host.initials"
            :name="host.name"
            :nickname="host.nickname"
            :avatar-url="host.avatarUrl"
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

import gameTableUrl from '@/assets/images/game-table.png';
import { getPlayerAvatarUrl, PLAYERS_PRESET } from '@/data/playersPreset';

type PlayerViewModel = {
  id: string;
  initials: string;
  name: string;
  nickname: string;
  avatarUrl: string;
  top: string;
  left: string;
};

const gameBgUrl = gameTableUrl;
const bgOk = ref(true);

function seatSortKey(id: string): number {
  if (id === 'host') return 0;
  const m = id.match(/^p(\d+)$/);
  if (!m) return 999;
  return Number(m[1]);
}

// Equal spacing: 11 seats (10 players + host) distributed evenly around the table.
// We approximate the table as an ellipse inside the 16:9 container.
function seatPosition(seatIndex: number, seatCount: number): { top: string; left: string } {
  const step = (2 * Math.PI) / seatCount;
  const baseAngle = Math.PI / 2; // seat 0 at bottom-center
  const angle = baseAngle - seatIndex * step; // clockwise

  // Tunables (in % of container)
  const centerX = 50;
  const centerY = 50;
  const radiusX = 46;
  const radiusY = 38;

  const left = centerX + radiusX * Math.cos(angle);
  const top = centerY + radiusY * Math.sin(angle);

  return { left: `${left}%`, top: `${top}%` };
}

const seatCount = 11;

const seatModels: PlayerViewModel[] = [...PLAYERS_PRESET]
  .slice()
  .sort((a, b) => seatSortKey(a.id) - seatSortKey(b.id))
  .map((p, idx) => {
    const pos = seatPosition(idx, seatCount);
    return {
      id: p.id,
      initials: p.id === 'host' ? 'HOST' : p.id.toUpperCase(),
      name: p.name,
      nickname: p.nickname,
      avatarUrl: getPlayerAvatarUrl(p.avatar),
      top: pos.top,
      left: pos.left
    };
  });

const host = seatModels.find((p) => p.id === 'host')!;
const players = seatModels.filter((p) => p.id !== 'host');
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


