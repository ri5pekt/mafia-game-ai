<template>
    <div class="layout" :class="{ sfw: hideVisuals }">
        <aside class="sidebar">
            <div class="sidebarStack">
                <div class="chatWrap">
                    <ChatPanel :messages="chatMessages" />
                </div>

                <Card class="devCard" :class="{ collapsed: devCollapsed }">
                    <template #title>
                        <div class="devTitleRow" @click="devCollapsed = !devCollapsed" role="button" tabindex="0">
                            <span>Dev Controls</span>
                            <Button
                                class="devToggle"
                                severity="secondary"
                                text
                                :icon="devCollapsed ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
                                @click.stop="devCollapsed = !devCollapsed"
                            />
                        </div>
                    </template>
                    <template #content>
                        <div v-if="!devCollapsed">
                            <div class="devMeta">
                                <div class="devLine devLineSwitch">
                                    <span class="devK">Safe for work</span>
                                    <div class="devSwitch">
                                        <ToggleSwitch v-model="hideVisuals" />
                                    </div>
                                </div>
                                <div class="devLine">
                                    <span class="devK">Phase</span>
                                    <span class="devV">{{ loopState.phaseId ?? "—" }}</span>
                                </div>
                                <div class="devLine">
                                    <span class="devK">Current speaker</span>
                                    <span class="devV">
                                        {{ currentSpeakerLabel ?? "—" }}
                                    </span>
                                </div>
                            </div>

                            <Divider />

                            <div class="devActions">
                                <div class="devRow" v-if="canSpeak">
                                    <InputText class="devInput" v-model="speakDraft" placeholder="Speak (optional)" />
                                    <Button label="Speak" :disabled="speakDraft.trim().length === 0" @click="onSpeak" />
                                </div>

                                <div class="devRow" v-if="loopState.phaseId === 'DAY_DISCUSSION'">
                                    <div class="devHint">
                                        AI is wired for <b>DAY_DISCUSSION</b> only (speak + optional nomination).
                                    </div>
                                    <Button
                                        label="Request AI"
                                        severity="secondary"
                                        :loading="aiBusy"
                                        :disabled="aiBusy || !gameMeta || Boolean(gameMeta.endedAt)"
                                        @click="requestAi"
                                    />
                                </div>
                                <div class="devRow" v-if="canNominatePhase">
                                    <InputText
                                        class="devInput"
                                        v-model="nominateDraft"
                                        placeholder="Nominate seat # (1-10)"
                                    />
                                    <Button label="Nominate" :disabled="!canNominate" @click="onNominate" />
                                </div>

                                <div
                                    class="devRow"
                                    v-if="loopState.phaseId === 'DAY_VOTING' || loopState.phaseId === 'TIE_REVOTE'"
                                >
                                    <Dropdown
                                        class="devInput"
                                        v-model="voteSelection"
                                        :options="voteOptions"
                                        optionLabel="label"
                                        optionValue="value"
                                        placeholder="Select candidate"
                                    />
                                    <Button label="Vote" :disabled="voteSelection == null" @click="onVote" />
                                </div>

                                <div class="devRow" v-if="loopState.phaseId === 'MASS_ELIMINATION_PROPOSAL'">
                                    <Dropdown
                                        class="devInput"
                                        v-model="yesNoSelection"
                                        :options="yesNoOptions"
                                        optionLabel="label"
                                        optionValue="value"
                                        placeholder="Yes / No"
                                    />
                                    <Button label="Vote" :disabled="!yesNoSelection" @click="onProposalVote" />
                                </div>

                                <div class="devRow" v-if="loopState.phaseId === 'NIGHT_MAFIA_DISCUSSION'">
                                    <Dropdown
                                        class="devInput"
                                        v-model="nightSuggestTarget"
                                        :options="nightKillOptions"
                                        optionLabel="label"
                                        optionValue="value"
                                        placeholder="Suggest kill target"
                                    />
                                    <Button
                                        label="Suggest"
                                        :disabled="nightSuggestTarget == null"
                                        @click="nightSuggestTarget != null && onNightSuggestTarget(nightSuggestTarget)"
                                    />
                                </div>

                                <div
                                    class="devRow"
                                    v-if="loopState.phaseId === 'NIGHT_MAFIA_DISCUSSION' && canActAsBossNow()"
                                >
                                    <Dropdown
                                        class="devInput"
                                        v-model="nightKillTarget"
                                        :options="nightKillOptions"
                                        optionLabel="label"
                                        optionValue="value"
                                        placeholder="Select kill target (boss)"
                                    />
                                    <Button
                                        label="Select"
                                        :disabled="nightKillTarget == null"
                                        @click="nightKillTarget != null && onNightSelectKillTarget(nightKillTarget)"
                                    />
                                </div>

                                <div class="devRow" v-if="loopState.phaseId === 'NIGHT_MAFIA_BOSS_GUESS'">
                                    <Dropdown
                                        class="devInput"
                                        v-model="nightBossGuessTarget"
                                        :options="nightGuessOptions"
                                        optionLabel="label"
                                        optionValue="value"
                                        placeholder="Boss: guess Sheriff?"
                                    />
                                    <Button
                                        label="Guess"
                                        :disabled="nightBossGuessTarget == null"
                                        @click="nightBossGuessTarget != null && onBossGuess(nightBossGuessTarget)"
                                    />
                                </div>

                                <div class="devRow" v-if="loopState.phaseId === 'NIGHT_SHERIFF_ACTION'">
                                    <Dropdown
                                        class="devInput"
                                        v-model="nightSheriffTarget"
                                        :options="nightGuessOptions"
                                        optionLabel="label"
                                        optionValue="value"
                                        placeholder="Sheriff: investigate"
                                    />
                                    <Button
                                        label="Investigate"
                                        :disabled="nightSheriffTarget == null"
                                        @click="nightSheriffTarget != null && onSheriffInvestigate(nightSheriffTarget)"
                                    />
                                </div>

                                <div class="devRow devRowButtons">
                                    <Button v-if="canFinishTurn" label="Finish turn" @click="onEndTurn" />
                                    <Button severity="secondary" label="New game" @click="createNewGame" />
                                </div>

                                <div class="devRow">
                                    <Dropdown
                                        class="devInput devSmall"
                                        v-model="devPhaseTo"
                                        :options="[
                                            'DAY_DISCUSSION',
                                            'DAY_VOTING',
                                            'TIE_DISCUSSION',
                                            'TIE_REVOTE',
                                            'MASS_ELIMINATION_PROPOSAL',
                                            'NIGHT_MAFIA_DISCUSSION',
                                            'NIGHT_MAFIA_BOSS_GUESS',
                                            'NIGHT_SHERIFF_ACTION',
                                            'ELIMINATION_SPEECH',
                                            'WIN_CHECK',
                                            'GAME_END',
                                        ]"
                                        placeholder="Switch phase (dev)"
                                    />
                                    <Button
                                        class="devSmallBtn"
                                        severity="secondary"
                                        label="Set"
                                        @click="devSwitchPhase"
                                    />
                                </div>

                                <div class="devRow devRowButtons">
                                    <Button
                                        severity="danger"
                                        label="End game"
                                        :disabled="!gameMeta || Boolean(gameMeta.endedAt)"
                                        @click="showEndGameConfirm = true"
                                    />
                                </div>

                                <div v-if="gameError" class="devError">{{ gameError }}</div>
                            </div>
                        </div>
                    </template>
                </Card>
            </div>
        </aside>

        <Dialog v-model:visible="showEndGameConfirm" modal header="End game?" :style="{ width: '420px' }">
            <div class="confirmText">
                This will mark the current game as ended. You can still start a new game afterwards.
            </div>
            <template #footer>
                <Button severity="secondary" label="Cancel" @click="showEndGameConfirm = false" />
                <Button severity="danger" label="End game" @click="onEndGame" />
            </template>
        </Dialog>

        <main v-if="!hideVisuals" class="main">
            <section class="tableShell">
                <div class="phaseHud">
                    <PhaseIndicator :phase="uiPhase" :day-number="loopState.dayNumber" />
                </div>
                <div class="timerHud" aria-label="Game timer">
                    <div class="timerLabel">Time</div>
                    <div class="timerValue">{{ gameTimerText }}</div>
                </div>

                <!--
          Layout editing panel (hidden by default).
          To re-enable layout editing + "copy coords" tools, set ENABLE_LAYOUT_EDITING = true in <script setup>.
        -->
                <div v-if="ENABLE_LAYOUT_EDITING" class="coordHud" aria-label="Layout tools">
                    <div class="coordHudRow">
                        <Button size="small" label="Copy avatar coords" icon="pi pi-copy" @click="copyAvatarCoords" />
                        <Button size="small" label="Copy number coords" icon="pi pi-copy" @click="copyTagCoords" />
                        <Button
                            size="small"
                            severity="secondary"
                            label="Reset"
                            icon="pi pi-refresh"
                            @click="resetCoords"
                        />
                    </div>
                    <div class="coordHudHint">
                        Drag avatars + number bubbles. Coords are stored as % of the table container.
                    </div>
                </div>

                <div ref="tableEl" class="tableContainer" :class="{ editing: ENABLE_LAYOUT_EDITING, night: isNight }">
                    <div class="tableFallback" aria-hidden="true" />
                    <img v-if="bgOk" class="tableBg" :src="gameBgUrl" alt="Game table" @error="bgOk = false" />

                    <!-- Seat/Player number markers (environment overlay; NOT part of avatars) -->
                    <div
                        v-for="s in seats"
                        :key="`seat-${s.seatNumber}-tag`"
                        class="seatTag"
                        :class="{
                            dragging: activeDrag?.kind === 'tag' && activeDrag?.key === `p${s.seatNumber}`,
                            active: loopState.currentSpeakerSeatNumber === s.seatNumber,
                            eliminated: !s.alive,
                        }"
                        :style="{
                            top: tagPositions[`p${s.seatNumber}`]?.top ?? s.top,
                            left: tagPositions[`p${s.seatNumber}`]?.left ?? s.left,
                            zIndex: s.zIndex + 1,
                        }"
                        :title="`Seat ${s.seatNumber}`"
                        @pointerdown="startDrag('tag', `p${s.seatNumber}`, $event)"
                    >
                        {{ s.seatNumber }}
                    </div>

                    <div
                        v-for="s in seats"
                        :key="`seat-${s.seatNumber}`"
                        class="avatarWrap"
                        :class="{
                            dragging: activeDrag?.kind === 'avatar' && activeDrag?.key === `p${s.seatNumber}`,
                            active: loopState.currentSpeakerSeatNumber === s.seatNumber,
                            eliminated: !s.alive,
                        }"
                        :style="{
                            top: s.top,
                            left: s.left,
                            zIndex: s.zIndex,
                        }"
                        @pointerdown="startDrag('avatar', `p${s.seatNumber}`, $event)"
                    >
                        <PlayerAvatar
                            :initials="`P${s.seatNumber}`"
                            :name="s.person.name"
                            :nickname="s.person.nickname"
                            :avatar-url="s.person.avatarUrl"
                            :role-tag="s.person.roleTag"
                            :is-eliminated="!s.alive"
                            :mask-photo="s.alive && isNight && !isSeatAwake(s.seatNumber)"
                            :status-icon-url="eliminationIconUrlBySeat.get(s.seatNumber)"
                            :is-loading="aiBusy && loopState.currentSpeakerSeatNumber === s.seatNumber"
                        />

                        <div v-if="voteCountBySeat.get(s.seatNumber)" class="voteBadge">
                            <img class="voteBadgeIcon" :src="voteIconUrl" alt="Vote" />
                            <span class="voteBadgeCount">x{{ voteCountBySeat.get(s.seatNumber) }}</span>
                        </div>

                        <div v-if="bubbleBySeat.get(`p${s.seatNumber}`)" class="speechBubble">
                            {{ bubbleBySeat.get(`p${s.seatNumber}`)?.text }}
                        </div>
                    </div>

                    <div
                        class="avatarWrap"
                        :class="{ dragging: activeDrag?.kind === 'avatar' && activeDrag?.key === 'host' }"
                        :style="{
                            top: hostSeat.top,
                            left: hostSeat.left,
                            zIndex: hostSeat.zIndex,
                        }"
                        @pointerdown="startDrag('avatar', 'host', $event)"
                    >
                        <PlayerAvatar
                            initials="HOST"
                            :name="hostSeat.person.name"
                            :nickname="hostSeat.person.nickname"
                            :avatar-url="hostSeat.person.avatarUrl"
                            :role-tag="hostSeat.person.roleTag"
                            is-host
                        />

                        <div v-if="bubbleBySeat.get('host')" class="speechBubble">
                            {{ bubbleBySeat.get("host")?.text }}
                        </div>
                    </div>
                </div>
            </section>
        </main>

        <aside class="rightbar">
            <div class="rightStack">
                <AiLogsCard v-model:collapsed="aiCollapsed" :ai-logs="aiLogs" />
                <RoleLogsCard v-model:collapsed="logsCollapsed" :role-logs="roleLogs" />
            </div>
        </aside>
    </div>
</template>

<script setup lang="ts">
import ChatPanel from "@/components/ChatPanel.vue";
import PhaseIndicator, { type UiPhase } from "@/components/PhaseIndicator.vue";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import AiLogsCard from "@/views/gameScreen/AiLogsCard.vue";
import RoleLogsCard from "@/views/gameScreen/RoleLogsCard.vue";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import gameTableUrl from "@/assets/images/game-table.png";
import { getPlayerAvatarUrl, PLAYERS_PRESET } from "@/data/playersPreset";
import type { RoleId } from "@shared/rules";
import { ROLES } from "@shared/rules";
import { useGameSession } from "@/composables/useGameSession";
import { buildRoleLogTexts } from "@/game/logs";

type Coord = { top: string; left: string };
type CoordMap = Record<string, Coord>;

const gameBgUrl = gameTableUrl;
const bgOk = ref(true);

const emit = defineEmits<{
    (e: "ended"): void;
}>();

/**
 * Layout editing mode (dragging + "copy coords" panel).
 * Keep this OFF for normal gameplay UI. Flip to true when you want to reposition items and copy new coords.
 */
const ENABLE_LAYOUT_EDITING = false;

// Night-phase dev dropdown drafts (keep separate from day vote / mass proposal inputs).
const nightSuggestTarget = ref<number | null>(null);
const nightKillTarget = ref<number | null>(null);
const nightBossGuessTarget = ref<number | null>(null);
const nightSheriffTarget = ref<number | null>(null);

const yesNoOptions = [
    { label: "Yes", value: "YES" },
    { label: "No", value: "NO" },
];

const logsCollapsed = ref(false);
const aiCollapsed = ref(true);

// Captured seat coordinates (percent-based) provided by you.
// Note: keys p1..p10 represent SEAT positions (not player identities).
const DEFAULT_AVATAR_POSITIONS: CoordMap = {
    p1: { left: "29.816514%", top: "81.368927%" },
    p2: { left: "14.036697%", top: "68.521089%" },
    p3: { left: "10.000000%", top: "42.278697%" },
    p4: { left: "22.935780%", top: "23.553657%" },
    p5: { left: "39.724771%", top: "17.403097%" },
    p6: { left: "58.715596%", top: "17.539776%" },
    p7: { left: "75.871560%", top: "23.143620%" },
    p8: { left: "88.715596%", top: "41.185264%" },
    p9: { left: "85.779817%", top: "67.974373%" },
    p10: { left: "69.357798%", top: "80.412173%" },
    host: { top: "84.88491979514961%", left: "49.90909090909091%" },
};

const DEFAULT_TAG_POSITIONS: CoordMap = {
    p1: { left: "34.128440%", top: "77.405232%" },
    p2: { left: "21.743119%", top: "68.384410%" },
    p3: { left: "18.532110%", top: "53.759744%" },
    p4: { left: "30.275229%", top: "44.875601%" },
    p5: { left: "42.752294%", top: "42.142018%" },
    p6: { left: "57.064220%", top: "42.688735%" },
    p7: { left: "68.990826%", top: "46.379071%" },
    p8: { left: "80.550459%", top: "52.256273%" },
    p9: { left: "78.256881%", top: "68.521089%" },
    p10: { left: "65.596330%", top: "77.131874%" },
};

const avatarPositions = ref<CoordMap>(structuredClone(DEFAULT_AVATAR_POSITIONS));
const tagPositions = ref<CoordMap>(structuredClone(DEFAULT_TAG_POSITIONS));

const hideVisuals = useLocalStorageBool("mafia-game-ai:safeForWork", false);

type RoleTag = { iconUrl: string; label: string; tone: "town" | "mafia" };

const ROLE_ICON_URL: Record<RoleId, string> = {
    TOWN: new URL("../assets/images/roles/town.svg", import.meta.url).href,
    SHERIFF: new URL("../assets/images/roles/sheriff.svg", import.meta.url).href,
    MAFIA: new URL("../assets/images/roles/mafia.svg", import.meta.url).href,
    MAFIA_BOSS: new URL("../assets/images/roles/boss.svg", import.meta.url).href,
};

type Person = {
    id: string;
    name: string;
    nickname: string;
    avatarUrl: string;
    roleId: RoleId;
    roleTag?: RoleTag;
};

type Seat = {
    seatNumber: number; // 1..10
    top: string;
    left: string;
    zIndex: number;
    person: Person;
    alive: boolean;
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
    return ["MAFIA_BOSS", "MAFIA", "MAFIA", "SHERIFF", "TOWN", "TOWN", "TOWN", "TOWN", "TOWN", "TOWN"];
}

function toRoleTag(roleId: RoleId): RoleTag {
    const alignment = ROLES[roleId].alignment;
    const tone: RoleTag["tone"] = alignment === "MAFIA" ? "mafia" : "town";
    return { iconUrl: ROLE_ICON_URL[roleId], label: roleId, tone };
}

const hostPresets = PLAYERS_PRESET.filter((p) => p.id === "host" || p.id.startsWith("host"));
const playerPresets = PLAYERS_PRESET.filter((p) => !(p.id === "host" || p.id.startsWith("host")));

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Used only for the pre-game UI (before `gameMeta.host` exists).
const selectedHostPreset = ref(pickRandom(hostPresets));

// Re-randomize on each page load (refresh). Seat numbers are fixed.
const shuffledPlayers = shuffle(playerPresets);

function presetById(id: string) {
    return PLAYERS_PRESET.find((p) => p.id === id);
}

const voteIconUrl = new URL("../assets/images/icons/vote.svg", import.meta.url).href;

function formatSeatLine(s: Seat): string {
    return `#${s.seatNumber}: ${s.person.name} (${s.person.nickname})`;
}

const session = useGameSession({
    onEnded: () => emit("ended"),
    createPayload: () => {
        const players = Array.from({ length: 10 }, (_, i) => {
            const seatNumber = i + 1;
            const p = shuffledPlayers[i];
            return { id: p.id, seatNumber, name: p.name, nickname: p.nickname };
        });
        // Randomize host each game. Persist host id so we can render the right avatar after reload.
        selectedHostPreset.value = pickRandom(hostPresets);
        const host = {
            id: selectedHostPreset.value.id,
            name: selectedHostPreset.value.name,
            nickname: selectedHostPreset.value.nickname,
        };
        return { players, host };
    },
    lobbySeatLines: () => seats.value.map(formatSeatLine),
});

const {
    gameMeta,
    gameEvents,
    loopState,
    gameError,
    showEndGameConfirm,
    devCollapsed,
    speakDraft,
    nominateDraft,
    voteSelection,
    yesNoSelection,
    bubbleBySeat,
    aliveSeatNumbers,
    nominees,
    tieCandidates,
    voteOptions,
    voteCountBySeat,
    eliminationIconUrlBySeat,
    canSpeak,
    canFinishTurn,
    canNominatePhase,
    canNominate,
    chatMessages,
    gameTimerText,
    createNewGame,
    onSpeak,
    onNominate,
    onVote,
    onProposalVote,
    onEndTurn,
    onEndGame,
    roleBySeatNumber,
    actingBossSeatNumber,
    nightKillOptions,
    nightGuessOptions,
    canActAsBossNow,
    onNightSuggestTarget,
    onNightSelectKillTarget,
    onBossGuess,
    onSheriffInvestigate,
    devPhaseTo,
    devSwitchPhase,
    requestAi,
    aiLogs,
    aiBusy,
} = session;

const roleLogs = computed(() => buildRoleLogTexts({ meta: gameMeta.value, events: gameEvents.value }));

const seats = computed<Seat[]>(() => {
    // If a game is loaded, render seats from persisted game meta (prevents mismatch on reload).
    const persisted = gameMeta.value?.players;
    const alive = new Set(aliveSeatNumbers.value);

    return Array.from({ length: 10 }, (_, i) => {
        const seatNumber = i + 1;
        const seatKey = `p${seatNumber}`;
        const pos = avatarPositions.value[seatKey];
        const topNumber = Number.parseFloat(pos.top);

        const persistedPlayer = persisted?.find((p) => p.seatNumber === seatNumber);
        const shuffledPreset = shuffledPlayers[i];
        const resolvedId = persistedPlayer?.id ?? shuffledPreset?.id ?? `seat-${seatNumber}`;
        const preset = presetById(resolvedId) ?? shuffledPreset;
        const roleId = roleBySeatNumber(seatNumber);

        const person: Person = {
            id: resolvedId,
            name: persistedPlayer?.name ?? preset?.name ?? `Player ${seatNumber}`,
            nickname: persistedPlayer?.nickname ?? preset?.nickname ?? "",
            avatarUrl: preset?.avatar ? getPlayerAvatarUrl(preset.avatar) : "",
            roleId,
            roleTag: toRoleTag(roleId),
        };

        return {
            seatNumber,
            top: pos.top,
            left: pos.left,
            zIndex: Math.round(topNumber * 10),
            person,
            alive: alive.has(seatNumber),
        };
    });
});

const hostSeat = computed(() => {
    const pos = avatarPositions.value.host;
    const topNumber = Number.parseFloat(pos.top);

    const hostId = gameMeta.value?.host?.id ?? selectedHostPreset.value?.id ?? "host";
    const preset = presetById(hostId) ?? selectedHostPreset.value;

    const person: Person = {
        id: hostId,
        name: gameMeta.value?.host?.name ?? preset?.name ?? "Host",
        nickname: gameMeta.value?.host?.nickname ?? preset?.nickname ?? "",
        avatarUrl: preset?.avatar ? getPlayerAvatarUrl(preset.avatar) : "",
        roleId: "TOWN",
    };
    return { top: pos.top, left: pos.left, zIndex: Math.round(topNumber * 10) + 50, person };
});

const currentSpeakerSeat = computed(() => {
    const seatNo = loopState.value.currentSpeakerSeatNumber;
    if (!seatNo) return null;
    return seats.value.find((s) => s.seatNumber === seatNo) ?? null;
});

const currentSpeakerLabel = computed(() => {
    const s = currentSpeakerSeat.value;
    if (!s) return null;
    return `#${s.seatNumber} ${s.person.name} (${s.person.nickname})`;
});

const uiPhase = computed<UiPhase>(() => {
    switch (loopState.value.phaseId) {
        case "DAY_DISCUSSION":
        case "TIE_DISCUSSION":
            return "DAY";
        case "DAY_VOTING":
        case "TIE_REVOTE":
        case "MASS_ELIMINATION_PROPOSAL":
            return "VOTING";
        case "ELIMINATION_SPEECH":
            return "DAY";
        case "NIGHT_MAFIA_DISCUSSION":
        case "NIGHT_MAFIA_BOSS_GUESS":
        case "NIGHT_SHERIFF_ACTION":
            return "NIGHT";
        case "MORNING_REVEAL":
            return "DAY";
        case "GAME_END":
            return "DAY";
        case "WIN_CHECK":
            return "DAY";
    }
    return "DAY";
});

const isNight = computed(() => loopState.value.phaseId.startsWith("NIGHT_"));

function isSeatAwake(seatNumber: number): boolean {
    const phase = loopState.value.phaseId;
    const role = roleBySeatNumber(seatNumber);
    if (phase === "NIGHT_MAFIA_DISCUSSION") return role === "MAFIA" || role === "MAFIA_BOSS";
    if (phase === "NIGHT_MAFIA_BOSS_GUESS") return seatNumber === actingBossSeatNumber.value;
    if (phase === "NIGHT_SHERIFF_ACTION") return role === "SHERIFF";
    return true;
}

type DragKind = "avatar" | "tag";
type ActiveDrag = {
    kind: DragKind;
    key: string;
    pointerId: number;
};

const tableEl = ref<HTMLElement | null>(null);
const activeDrag = ref<ActiveDrag | null>(null);

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function pxToPercent(clientX: number, clientY: number) {
    if (!ENABLE_LAYOUT_EDITING) return null;
    const el = tableEl.value;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((clientY - rect.top) / rect.height, 0, 1);
    return { left: `${(x * 100).toFixed(6)}%`, top: `${(y * 100).toFixed(6)}%` };
}

function setCoord(kind: DragKind, key: string, coord: Coord) {
    if (kind === "avatar") avatarPositions.value[key] = coord;
    else tagPositions.value[key] = coord;
}

function startDrag(kind: DragKind, key: string, ev: PointerEvent) {
    if (!ENABLE_LAYOUT_EDITING) return;
    // Only left mouse / primary touch.
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    const coord = pxToPercent(ev.clientX, ev.clientY);
    if (!coord) return;

    (ev.currentTarget as HTMLElement | null)?.setPointerCapture?.(ev.pointerId);
    activeDrag.value = { kind, key, pointerId: ev.pointerId };
    setCoord(kind, key, coord);
    ev.preventDefault();
}

function onPointerMove(ev: PointerEvent) {
    if (!ENABLE_LAYOUT_EDITING) return;
    const d = activeDrag.value;
    if (!d || ev.pointerId !== d.pointerId) return;
    const coord = pxToPercent(ev.clientX, ev.clientY);
    if (!coord) return;
    setCoord(d.kind, d.key, coord);
}

function stopDrag(ev: PointerEvent) {
    if (!ENABLE_LAYOUT_EDITING) return;
    const d = activeDrag.value;
    if (!d || ev.pointerId !== d.pointerId) return;
    activeDrag.value = null;
}

// Global listeners so dragging keeps working even if the pointer briefly leaves the element.
// (Only attached when ENABLE_LAYOUT_EDITING === true.)
onMounted(() => {
    if (!ENABLE_LAYOUT_EDITING) return;
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
});

onBeforeUnmount(() => {
    if (!ENABLE_LAYOUT_EDITING) return;
    window.removeEventListener("pointermove", onPointerMove as any);
    window.removeEventListener("pointerup", stopDrag as any);
    window.removeEventListener("pointercancel", stopDrag as any);
});

function sortedStringify(map: CoordMap): string {
    const keys = Object.keys(map).sort((a, b) => {
        // host at the end
        if (a === "host") return 1;
        if (b === "host") return -1;
        const an = Number.parseInt(a.replace("p", ""), 10);
        const bn = Number.parseInt(b.replace("p", ""), 10);
        return an - bn;
    });
    const obj: CoordMap = {};
    for (const k of keys) obj[k] = map[k];
    return JSON.stringify(obj, null, 2);
}

async function copyText(label: string, text: string) {
    try {
        await navigator.clipboard.writeText(text);
        console.log(`[coords] copied ${label}`);
    } catch (err) {
        console.warn(`[coords] clipboard failed for ${label}`, err);
        // Fallback: prompt so user can still copy.
        window.prompt(`Copy ${label} coords:`, text);
    }
}

function copyAvatarCoords() {
    return copyText("avatar", sortedStringify(avatarPositions.value));
}

function copyTagCoords() {
    return copyText("number", sortedStringify(tagPositions.value));
}

function resetCoords() {
    avatarPositions.value = structuredClone(DEFAULT_AVATAR_POSITIONS);
    tagPositions.value = structuredClone(DEFAULT_TAG_POSITIONS);
}

function useLocalStorageBool(key: string, defaultValue: boolean) {
    const v = ref(defaultValue);

    try {
        const raw = localStorage.getItem(key);
        if (raw === "true") v.value = true;
        if (raw === "false") v.value = false;
    } catch {
        // ignore (private mode / blocked storage)
    }

    watch(
        v,
        (next) => {
            try {
                localStorage.setItem(key, String(next));
            } catch {
                // ignore
            }
        },
        { flush: "post" }
    );

    return v;
}
</script>

<style scoped>
.layout {
    display: flex;
    height: 100vh;
    width: 100%;
}

.layout.sfw {
    gap: 12px;
    padding: 12px;
    box-sizing: border-box;
}

.layout.sfw .sidebar {
    border-right: none;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
}

.layout.sfw .rightbar {
    border-left: none;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
}

.sidebar {
    width: 320px;
    min-width: 320px;
    padding: 12px;
    box-sizing: border-box;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(12, 16, 32, 0.9);
    display: flex;
    flex-direction: column;
}

.sidebarStack {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-height: 0;
}

.rightbar {
    width: 560px;
    min-width: 560px;
    padding: 12px;
    box-sizing: border-box;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(12, 16, 32, 0.9);
    display: flex;
    flex-direction: column;
}

.rightStack {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-height: 0;
}

.devCard {
    background: rgba(12, 16, 32, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.92);
}

.logsCard {
    background: rgba(12, 16, 32, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.92);
}

.logsCard :deep(.p-card-body),
.logsCard :deep(.p-card-content),
.logsCard :deep(.p-card-caption),
.logsCard :deep(.p-card-title) {
    color: rgba(255, 255, 255, 0.92);
}

.logsTitleRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    cursor: pointer;
    user-select: none;
}

.logsToggle {
    margin-left: auto;
}

.logsBody {
    display: grid;
    gap: 10px;
}

.logsHint {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.25;
}

.logSection {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    overflow: hidden;
}

.logHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 10px;
    cursor: pointer;
    user-select: none;
}

.logTitle {
    font-weight: 900;
    letter-spacing: 0.2px;
    font-size: 13px;
}

.logActions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.logChevron {
    display: inline-block;
    transform: rotate(-90deg);
    opacity: 0.8;
    transition: transform 120ms ease;
}

.logChevron.open {
    transform: rotate(0deg);
}

.logContent {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.logText {
    width: 100%;
    height: 180px;
    resize: vertical;
    border: 0;
    padding: 10px 10px;
    background: rgba(0, 0, 0, 0.25);
    color: rgba(255, 255, 255, 0.92);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 12px;
    line-height: 1.3;
    outline: none;
}

.aiStream {
    max-height: 520px;
    overflow: auto;
    display: grid;
    gap: 12px;
    padding-right: 6px;
}

.aiEmpty {
    padding: 10px 10px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
}

.aiEntry {
    display: grid;
    gap: 10px;
}

.aiEntryHeader {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
}

.aiEntryTitle {
    font-weight: 800;
    color: rgba(255, 255, 255, 0.82);
}

.aiEntryMeta {
    opacity: 0.8;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.aiBlock {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    overflow: hidden;
}

.aiBlockTitle {
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.2px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.aiReq .aiBlockTitle {
    background: rgba(59, 130, 246, 0.18);
}

.aiResp .aiBlockTitle {
    background: rgba(34, 197, 94, 0.16);
}

.aiPre {
    margin: 0;
    padding: 10px 10px;
    font-size: 12px;
    line-height: 1.3;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.aiReq .aiPre {
    background: rgba(59, 130, 246, 0.08);
}

.aiResp .aiPre {
    background: rgba(34, 197, 94, 0.06);
}

.aiPending {
    padding: 10px 10px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    background: rgba(34, 197, 94, 0.04);
}

.aiErrorInline {
    padding: 10px 10px;
    font-size: 12px;
    color: rgba(248, 113, 113, 0.95);
    white-space: pre-line;
    background: rgba(248, 113, 113, 0.08);
}

.devCard :deep(.p-card-body),
.devCard :deep(.p-card-content),
.devCard :deep(.p-card-caption),
.devCard :deep(.p-card-title) {
    color: rgba(255, 255, 255, 0.92);
}

.devCard :deep(.p-divider) {
    border-color: rgba(255, 255, 255, 0.1);
}

.devMeta {
    display: grid;
    gap: 6px;
    font-size: 13px;
}

.devTitleRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    cursor: pointer;
    user-select: none;
}

.devToggle {
    margin-left: auto;
}

.devLine {
    display: flex;
    justify-content: space-between;
    gap: 10px;
}

.devLineSwitch {
    align-items: center;
}

.devSwitch {
    display: inline-flex;
    align-items: center;
}

.devK {
    color: rgba(255, 255, 255, 0.65);
}

.devV {
    color: rgba(255, 255, 255, 0.92);
    font-weight: 700;
    text-align: right;
}

.devActions {
    display: grid;
    gap: 10px;
}

.devRow {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: center;
}

.devRowButtons {
    grid-template-columns: auto auto;
    justify-content: space-between;
}

.confirmText {
    color: rgba(255, 255, 255, 0.88);
    line-height: 1.35;
}

.devInput {
    width: 100%;
    min-width: 0;
}

.devInput.p-dropdown {
    width: 100%;
}

/* Truncate selected value instead of expanding the layout */
.devInput.p-dropdown .p-dropdown-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}

.devRow > :global(.p-dropdown),
.devRow > :global(.p-inputtext) {
    min-width: 0;
}

.devSmall.p-dropdown {
    font-size: 12px;
}

.devSmall.p-dropdown .p-dropdown-label {
    font-size: 12px;
    padding-top: 6px;
    padding-bottom: 6px;
}

.devSmallBtn.p-button {
    font-size: 12px;
    padding: 6px 10px;
}

.devError {
    font-size: 12px;
    color: rgba(248, 113, 113, 0.95);
    white-space: pre-line;
}

.chatWrap {
    flex: 1;
    min-height: 0;
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

.coordHud {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 25;
    display: grid;
    gap: 6px;
    padding: 10px 10px;
    border-radius: 12px;
    background: rgba(12, 16, 32, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
}

.coordHudRow {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    flex-wrap: wrap;
}

.coordHudHint {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    max-width: 360px;
    text-align: right;
}

.phaseHud {
    position: absolute;
    top: -34px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
}

.timerHud {
    position: absolute;
    top: 8px;
    right: 10px;
    z-index: 20;
    display: grid;
    gap: 2px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(10px);
    user-select: none;
    min-width: 86px;
}

.timerLabel {
    font-size: 11px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.68);
    line-height: 1;
}

.timerValue {
    font-size: 16px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.94);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
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
    background: radial-gradient(800px 400px at 50% 40%, rgba(34, 197, 94, 0.18), transparent 55%),
        radial-gradient(900px 500px at 50% 55%, rgba(59, 130, 246, 0.16), transparent 60%),
        radial-gradient(600px 300px at 50% 65%, rgba(0, 0, 0, 0.35), transparent 60%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0));
    border: 1px solid rgba(255, 255, 255, 0.1);
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

.tableContainer.night .tableBg {
    filter: brightness(0.42) saturate(0.75) contrast(1.05) drop-shadow(0 16px 40px rgba(0, 0, 0, 0.65));
}

.tableContainer.night .tableFallback {
    filter: brightness(0.6) saturate(0.7);
}

.seatTag {
    position: absolute;
    transform: translate(-50%, -50%) translate(0, -78px);
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0px;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans", "Liberation Sans",
        sans-serif;
    font-weight: 800;
    font-size: 24px;
    line-height: 1;
    letter-spacing: -0.6px;
    color: rgba(18, 18, 18, 0.92);
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid rgba(0, 0, 0, 0.06);
    box-shadow: 0 10px 18px rgba(0, 0, 0, 0.14), 0 1px 0 rgba(255, 255, 255, 0.7) inset;
    pointer-events: none;
    cursor: default;
    user-select: none;
    touch-action: none;
}

.seatTag.active {
    box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.95), 0 12px 26px rgba(0, 0, 0, 0.18),
        0 1px 0 rgba(255, 255, 255, 0.7) inset;
}

.seatTag {
    text-shadow: none;
}

.avatarWrap {
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: none;
    cursor: default;
    user-select: none;
    touch-action: none;
}

.seatTag.eliminated {
    opacity: 0.35;
}

.avatarWrap.active {
    filter: drop-shadow(0 0 0 rgba(0, 0, 0, 0)) drop-shadow(0 0 18px rgba(250, 204, 21, 0.35));
}

.speechBubble {
    position: absolute;
    left: 50%;
    bottom: 110%;
    transform: translateX(-50%);
    width: 240px;
    max-width: min(280px, 70vw);
    padding: 8px 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.96);
    color: rgba(0, 0, 0, 0.9);
    font-size: 13px;
    line-height: 1.25;
    white-space: normal;
    word-break: normal;
    overflow-wrap: break-word;
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.22);
    border: 1px solid rgba(0, 0, 0, 0.08);
    pointer-events: none;
}

.speechBubble::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -6px;
    width: 12px;
    height: 12px;
    transform: translateX(-50%) rotate(45deg);
    background: rgba(255, 255, 255, 0.96);
    border-right: 1px solid rgba(0, 0, 0, 0.08);
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.voteBadge {
    position: absolute;
    left: 50%;
    top: -8px;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 10px 18px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(8px);
    pointer-events: none;
}

.voteBadgeIcon {
    width: 14px;
    height: 14px;
    opacity: 0.95;
}

.voteBadgeCount {
    font-size: 12px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.92);
    font-variant-numeric: tabular-nums;
}

.tableContainer.editing .seatTag,
.tableContainer.editing .avatarWrap {
    pointer-events: auto;
    cursor: grab;
}

.avatarWrap.dragging,
.seatTag.dragging {
    cursor: grabbing;
}
</style>
