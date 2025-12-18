<template>
  <div class="layout">
    <aside class="sidebar">
      <ChatPanel :messages="chatMessages" />
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
            v-for="s in seats"
            :key="`seat-${s.seatNumber}-tag`"
            class="seatTag"
            :style="{
              top: TAG_POSITIONS[`p${s.seatNumber}`]?.top ?? s.top,
              left: TAG_POSITIONS[`p${s.seatNumber}`]?.left ?? s.left,
              zIndex: s.zIndex + 1
            }"
            :title="`Seat ${s.seatNumber}`"
          >
            {{ s.seatNumber }}
          </div>

          <div
            v-for="s in seats"
            :key="`seat-${s.seatNumber}`"
            class="avatarWrap"
            :style="{
              top: s.top,
              left: s.left,
              zIndex: s.zIndex
            }"
          >
            <PlayerAvatar
              :initials="`P${s.seatNumber}`"
              :name="s.person.name"
              :nickname="s.person.nickname"
              :avatar-url="s.person.avatarUrl"
              :role-tag="s.person.roleTag"
            />
          </div>

          <div
            class="avatarWrap"
            :style="{
              top: hostSeat.top,
              left: hostSeat.left,
              zIndex: hostSeat.zIndex
            }"
          >
            <PlayerAvatar
              initials="HOST"
              :name="hostSeat.person.name"
              :nickname="hostSeat.person.nickname"
              :avatar-url="hostSeat.person.avatarUrl"
              :role-tag="hostSeat.person.roleTag"
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
import { computed, ref } from 'vue';

import gameTableUrl from '@/assets/images/game-table.png';
import { getPlayerAvatarUrl, PLAYERS_PRESET } from '@/data/playersPreset';
import type { RoleId } from '@shared/rules';
import { ROLES } from '@shared/rules';
import type { ChatMessage } from '@/types/chat';

type Coord = { top: string; left: string };
type CoordMap = Record<string, Coord>;

const gameBgUrl = gameTableUrl;
const bgOk = ref(true);

// Captured seat coordinates (percent-based) provided by you.
// Note: keys p1..p10 represent SEAT positions (not player identities).
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

type RoleTag = { iconUrl: string; label: string; tone: 'town' | 'mafia' };

const ROLE_ICON_URL: Record<RoleId, string> = {
  TOWN: new URL('../assets/images/roles/town.svg', import.meta.url).href,
  SHERIFF: new URL('../assets/images/roles/sheriff.svg', import.meta.url).href,
  MAFIA: new URL('../assets/images/roles/mafia.svg', import.meta.url).href,
  MAFIA_BOSS: new URL('../assets/images/roles/boss.svg', import.meta.url).href
};

type Person = {
  id: string;
  name: string;
  nickname: string;
  avatarUrl: string;
  roleId: RoleId;
  roleTag: RoleTag;
};

type Seat = {
  seatNumber: number; // 1..10
  top: string;
  left: string;
  zIndex: number;
  person: Person;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeRolePool(): RoleId[] {
  // v1 distribution for 10 players: 1 boss, 2 mafia, 1 sheriff, rest town.
  return ['MAFIA_BOSS', 'MAFIA', 'MAFIA', 'SHERIFF', 'TOWN', 'TOWN', 'TOWN', 'TOWN', 'TOWN', 'TOWN'];
}

function toRoleTag(roleId: RoleId): RoleTag {
  const alignment = ROLES[roleId].alignment;
  const tone: RoleTag['tone'] = alignment === 'MAFIA' ? 'mafia' : 'town';
  return { iconUrl: ROLE_ICON_URL[roleId], label: roleId, tone };
}

const hostPreset = PLAYERS_PRESET.find((p) => p.id === 'host')!;
const playerPresets = PLAYERS_PRESET.filter((p) => p.id !== 'host');

// Re-randomize on each page load (refresh). Seat numbers are fixed.
const shuffledPlayers = shuffle(playerPresets);
const shuffledRoles = shuffle(makeRolePool());

const seats = computed<Seat[]>(() => {
  return Array.from({ length: 10 }, (_, i) => {
    const seatNumber = i + 1;
    const seatKey = `p${seatNumber}`;
    const pos = AVATAR_POSITIONS[seatKey];
    const topNumber = Number.parseFloat(pos.top);

    const preset = shuffledPlayers[i];
    const roleId = shuffledRoles[i];

    const person: Person = {
      id: preset.id,
      name: preset.name,
      nickname: preset.nickname,
      avatarUrl: getPlayerAvatarUrl(preset.avatar),
      roleId,
      roleTag: toRoleTag(roleId)
    };

    return {
      seatNumber,
      top: pos.top,
      left: pos.left,
      zIndex: Math.round(topNumber * 10),
      person
    };
  });
});

const hostSeat = computed(() => {
  const pos = AVATAR_POSITIONS.host;
  const topNumber = Number.parseFloat(pos.top);
  const person: Person = {
    id: 'host',
    name: hostPreset.name,
    nickname: hostPreset.nickname,
    avatarUrl: getPlayerAvatarUrl(hostPreset.avatar),
    roleId: 'TOWN',
    roleTag: { iconUrl: ROLE_ICON_URL.TOWN, label: 'HOST', tone: 'town' }
  };
  return { top: pos.top, left: pos.left, zIndex: Math.round(topNumber * 10) + 50, person };
});

function formatSeatLine(s: Seat): string {
  return `#${s.seatNumber}: ${s.person.name} (${s.person.nickname})`;
}

const chatMessages = computed<ChatMessage[]>(() => {
  const seatLines = seats.value.map(formatSeatLine);
  return [
    {
      id: 'sys-0',
      kind: 'system',
      sender: 'SYSTEM',
      time: '00:00',
      text: 'Random seats selected. Please have a seat.'
    },
    {
      id: 'sys-1',
      kind: 'system',
      sender: 'SYSTEM',
      time: '00:01',
      text: seatLines.join('\n')
    },
    {
      id: 'sys-2',
      kind: 'system',
      sender: 'SYSTEM',
      time: '00:02',
      text: "Random roles assigned. Don't tell anyone!"
    },
    {
      id: 'host-0',
      kind: 'host',
      sender: 'HOST',
      time: '00:03',
      text: 'Welcome to the table. Be civil, be clever, and have a nice game.'
    }
  ];
});
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


