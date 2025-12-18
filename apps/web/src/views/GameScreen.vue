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

const POSITION_BY_ID: Record<string, Pick<PlayerViewModel, 'top' | 'left'>> = {
  p1: { top: '12%', left: '50%' },
  p2: { top: '18%', left: '70%' },
  p3: { top: '35%', left: '82%' },
  p4: { top: '55%', left: '82%' },
  p5: { top: '72%', left: '70%' },
  p6: { top: '78%', left: '50%' },
  p7: { top: '72%', left: '30%' },
  p8: { top: '55%', left: '18%' },
  p9: { top: '35%', left: '18%' },
  p10: { top: '18%', left: '30%' }
};

const players: PlayerViewModel[] = PLAYERS_PRESET.map((p) => {
  const pos = POSITION_BY_ID[p.id];
  return {
    id: p.id,
    initials: p.id.toUpperCase(),
    name: p.name,
    nickname: p.nickname,
    avatarUrl: getPlayerAvatarUrl(p.avatar),
    top: pos?.top ?? '50%',
    left: pos?.left ?? '50%'
  };
});

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


