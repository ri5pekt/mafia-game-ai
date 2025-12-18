<template>
  <div class="layout">
    <aside class="sidebar">
      <ChatPanel />
    </aside>

    <main class="main">
      <section class="tableShell">
        <div class="hud">
          <Button
            :label="isEditMode ? 'Done' : 'Edit Layout'"
            :severity="isEditMode ? 'success' : 'secondary'"
            @click="isEditMode = !isEditMode"
          />
          <Button
            label="Copy Coords"
            severity="secondary"
            :disabled="!isEditMode"
            @click="copyCoords()"
          />
          <Button
            label="Reset"
            severity="secondary"
            :disabled="!isEditMode"
            @click="resetCoords()"
          />
        </div>

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
            :class="{ editing: isEditMode }"
            :style="{
              top: tagPositions[p.id]?.top ?? p.top,
              left: tagPositions[p.id]?.left ?? p.left,
              zIndex: p.zIndex + 1
            }"
            :title="`Seat ${p.seatIndex}: ${p.id.toUpperCase()}`"
            @pointerdown="(e) => isEditMode && startDrag(e, `tag:${p.id}`)"
          >
            {{ p.tableNumber }}
          </div>

          <div
            v-for="p in players"
            :key="p.id"
            class="avatarWrap"
            :class="{ editing: isEditMode }"
            :style="{
              top: avatarPositions[p.id]?.top ?? p.top,
              left: avatarPositions[p.id]?.left ?? p.left,
              zIndex: p.zIndex
            }"
            @pointerdown="(e) => isEditMode && startDrag(e, `avatar:${p.id}`)"
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
            :class="{ editing: isEditMode }"
            :style="{
              top: avatarPositions[host.id]?.top ?? host.top,
              left: avatarPositions[host.id]?.left ?? host.left,
              zIndex: host.zIndex
            }"
            @pointerdown="(e) => isEditMode && startDrag(e, `avatar:${host.id}`)"
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

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
const isEditMode = ref(false);

type Coord = { top: string; left: string };
type CoordMap = Record<string, Coord>;

const LAYOUT_STORAGE_KEY = 'mafia.layout.v1';

const avatarPositions = ref<CoordMap>({});
const tagPositions = ref<CoordMap>({});

type DragKind = 'avatar' | 'tag';
type DragTarget = { kind: DragKind; id: string };

const drag = ref<{
  active: boolean;
  target: DragTarget | null;
  startPointerX: number;
  startPointerY: number;
  startTop: number; // percent
  startLeft: number; // percent
  rect: DOMRect | null;
} | null>(null);

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
    const topNumber = Number.parseFloat(pos.top);
    const tableNumber = p.id === 'host' ? 0 : Number.parseInt(p.id.replace('p', ''), 10);
    return {
      id: p.id,
      initials: p.id === 'host' ? 'HOST' : p.id.toUpperCase(),
      name: p.name,
      nickname: p.nickname,
      avatarUrl: getPlayerAvatarUrl(p.avatar),
      top: pos.top,
      left: pos.left,
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

const defaultAvatarPositions = computed<CoordMap>(() => {
  const map: CoordMap = {};
  for (const p of seatModels) map[p.id] = { top: p.top, left: p.left };
  return map;
});

const defaultTagPositions = computed<CoordMap>(() => {
  const map: CoordMap = {};
  for (const p of players) map[p.id] = { top: p.top, left: p.left };
  return map;
});

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseDragTarget(key: string): DragTarget {
  const [kind, id] = key.split(':', 2);
  if (kind !== 'avatar' && kind !== 'tag') throw new Error(`Unknown drag kind: ${kind}`);
  return { kind, id };
}

function getRect(): DOMRect {
  const el = document.querySelector<HTMLElement>('.tableContainer');
  if (!el) throw new Error('tableContainer not found');
  return el.getBoundingClientRect();
}

function readCoord(map: CoordMap, id: string, fallback: Coord): { top: number; left: number } {
  const v = map[id] ?? fallback;
  return { top: Number.parseFloat(v.top), left: Number.parseFloat(v.left) };
}

function setCoord(map: CoordMap, id: string, top: number, left: number) {
  map[id] = { top: `${top}%`, left: `${left}%` };
}

function startDrag(e: PointerEvent, key: string) {
  const target = parseDragTarget(key);
  const rect = getRect();
  const mapRef = target.kind === 'avatar' ? avatarPositions : tagPositions;
  const fallback =
    target.kind === 'avatar'
      ? (defaultAvatarPositions.value[target.id] ?? { top: '50%', left: '50%' })
      : (defaultTagPositions.value[target.id] ?? { top: '50%', left: '50%' });

  const current = readCoord(mapRef.value, target.id, fallback);

  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  drag.value = {
    active: true,
    target,
    startPointerX: e.clientX,
    startPointerY: e.clientY,
    startTop: current.top,
    startLeft: current.left,
    rect
  };
}

function onPointerMove(e: PointerEvent) {
  if (!drag.value?.active || !drag.value.rect || !drag.value.target) return;
  const { rect, target, startPointerX, startPointerY, startTop, startLeft } = drag.value;

  const dxPx = e.clientX - startPointerX;
  const dyPx = e.clientY - startPointerY;
  const dxPct = (dxPx / rect.width) * 100;
  const dyPct = (dyPx / rect.height) * 100;

  const nextLeft = clamp(startLeft + dxPct, 0, 100);
  const nextTop = clamp(startTop + dyPct, 0, 100);

  const map = (target.kind === 'avatar' ? avatarPositions.value : tagPositions.value) as CoordMap;
  setCoord(map, target.id, nextTop, nextLeft);
}

function onPointerUp() {
  if (!drag.value?.active) return;
  drag.value = null;
  persistCoords();
}

function persistCoords() {
  const payload = {
    version: 1,
    units: 'percent',
    avatarPositions: avatarPositions.value,
    tagPositions: tagPositions.value
  };
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(payload, null, 2));
}

function loadCoords() {
  const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as {
      avatarPositions?: CoordMap;
      tagPositions?: CoordMap;
    };
    avatarPositions.value = parsed.avatarPositions ?? {};
    tagPositions.value = parsed.tagPositions ?? {};
  } catch {
    // ignore
  }
}

async function copyCoords() {
  const payload = {
    version: 1,
    units: 'percent',
    avatarPositions: avatarPositions.value,
    tagPositions: tagPositions.value
  };
  const text = JSON.stringify(payload, null, 2);
  await navigator.clipboard.writeText(text);
}

function resetCoords() {
  avatarPositions.value = { ...defaultAvatarPositions.value };
  tagPositions.value = { ...defaultTagPositions.value };
  persistCoords();
}

onMounted(() => {
  loadCoords();
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
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

.hud {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  z-index: 50;
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

.seatTag.editing {
  pointer-events: auto;
  cursor: grab;
}

.avatarWrap {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.avatarWrap.editing {
  pointer-events: auto;
  cursor: grab;
}
</style>


