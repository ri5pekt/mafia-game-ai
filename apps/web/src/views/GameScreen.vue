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

          <!-- Seat/Player number markers (environment overlay; NOT part of avatars) -->
          <div
            v-for="p in players"
            :key="`${p.id}-tag`"
            class="seatTag"
            :style="{
              top: TAG_POSITIONS[p.id]?.top ?? p.top,
              left: TAG_POSITIONS[p.id]?.left ?? p.left,
              zIndex: p.zIndex + 1
            }"
            :title="`Seat ${p.seatIndex}: ${p.id.toUpperCase()}`"
          >
            {{ p.tableNumber }}
          </div>

          <div
            v-for="p in players"
            :key="p.id"
            class="avatarWrap"
            :style="{
              top: p.top,
              left: p.left,
              zIndex: p.zIndex
            }"
          >
            <PlayerAvatar
              :initials="p.initials"
              :name="p.name"
              :nickname="p.nickname"
              :avatar-url="p.avatarUrl"
            />
          </div>

          <div
            class="avatarWrap"
            :style="{
              top: host.top,
              left: host.left,
              zIndex: host.zIndex
            }"
          >
            <PlayerAvatar
              :initials="host.initials"
              :name="host.name"
              :nickname="host.nickname"
              :avatar-url="host.avatarUrl"
              is-host
            />
          </div>
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
  zIndex: number;
  seatIndex: number;
  tableNumber: number;
};

const gameBgUrl = gameTableUrl;
const bgOk = ref(true);

type Coord = { top: string; left: string };
type CoordMap = Record<string, Coord>;

// Captured coordinates (percent-based) provided by you.
const AVATAR_POSITIONS: CoordMap = {
  p1: { top: '82.6448255964654%', left: '30.039613306133415%' },
  host: { top: '84.88491979514961%', left: '49.90909090909091%' },
  p10: { top: '81.29044289870437%', left: '70.7785685120484%' },
  p9: { top: '70.52610993623529%', left: '85.84307178630786%' },
  p2: { top: '70.79698647578752%', left: '14.156928213692154%' },
  p3: { top: '45.810980573600105%', left: '8.468213673477095%' },
  p4: { top: '25.927921728735793%', left: '19.59915594334048%' },
  p5: { top: '15.164526239962342%', left: '38.76757511256696%' },
  p6: { top: '14.893649700410133%', left: '58.777879432887566%' },
  p7: { top: '23.083718063437598%', left: '78.03720769302312%' },
  p8: { top: '45.40466576427178%', left: '88.80451359925017%' }
};

const TAG_POSITIONS: CoordMap = {
  p1: { top: '77.22729480542125%', left: '32.948704215224325%' },
  p10: { top: '76.68554172631684%', left: '66.77856851204838%' },
  p9: { top: '67.68190627093713%', left: '79.11579905903514%' },
  p2: { top: '69.03628896869816%', left: '20.611473668237608%' },
  p3: { top: '55.15622118815126%', left: '17.83185003711346%' },
  p4: { top: '44.07664987873368%', left: '27.32642867061321%' },
  p5: { top: '39.00166172055658%', left: '41.76757511256696%' },
  p6: { top: '39.13709999033268%', left: '58.141515796523926%' },
  p7: { top: '46.108223925375206%', left: '71.49175314756859%' },
  p8: { top: '54.20815329971852%', left: '79.98633178106836%' }
};

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
  // Counter-clockwise so seat #1 is to the host's LEFT and seat #10 is to the host's RIGHT.
  const angle = baseAngle + seatIndex * step;

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
    const override = AVATAR_POSITIONS[p.id];
    const effectivePos = override ?? pos;
    const topNumber = Number.parseFloat(effectivePos.top);
    const tableNumber = p.id === 'host' ? 0 : Number.parseInt(p.id.replace('p', ''), 10);
    return {
      id: p.id,
      initials: p.id === 'host' ? 'HOST' : p.id.toUpperCase(),
      name: p.name,
      nickname: p.nickname,
      avatarUrl: getPlayerAvatarUrl(p.avatar),
      top: effectivePos.top,
      left: effectivePos.left,
      // Stacking: lower on screen should render above higher (prevents "back row" covering "front row")
      zIndex: Math.round(topNumber * 10),
      seatIndex: idx,
      tableNumber: Number.isFinite(tableNumber) ? tableNumber : idx
    };
  });

const host = seatModels.find((p) => p.id === 'host')!;
// Keep DOM order stable by player number for debugging/inspection (p1..p10),
// while z-index controls visual stacking.
const players = seatModels.filter((p) => p.id !== 'host').sort((a, b) => seatSortKey(a.id) - seatSortKey(b.id));
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
  position: relative;
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

.seatTag {
  position: absolute;
  transform: translate(-50%, -50%) translate(0, -78px);
  width: 42px;
  height: 42px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 16px;
  letter-spacing: 0.2px;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.avatarWrap {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>


