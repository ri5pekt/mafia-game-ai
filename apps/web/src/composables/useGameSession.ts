import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { ChatMessage } from "@/types/chat";
import type { ApiGameEvent, ApiGameMeta, Bubble, LocalPhaseId } from "@/game/types";
import type { RoleId } from "@shared/rules";
import {
    aliveSeatsFromEvents,
    eliminationQueueFromPhaseChange,
    formatDuration,
    nomineesFromDiscussion,
    phaseWindowEvents,
    rebuildLoopStateFromEvents,
    tieCandidatesFromPhaseChange,
    voteCounts,
} from "@/game/logic";
import {
    DEFAULT_API_BASE,
    appendGameEvent,
    connectGameSse,
    createGame,
    endGame,
    getActiveGame,
    getGameEvents,
    getGameMeta,
    requestAiAct,
} from "@/game/api";
import { buildChatMessages } from "@/game/chat";
import { buildRoleLogTexts } from "@/game/logs";
import { PLAYERS_PRESET } from "@/data/playersPreset";

type CreatePayload = {
    players: { id: string; seatNumber: number; name: string; nickname: string }[];
    host: { id: string; name: string; nickname: string };
};

export function useGameSession(opts: {
    apiBase?: string;
    onEnded?: () => void;
    createPayload: () => CreatePayload;
    lobbySeatLines: () => string[];
}) {
    const apiBase = opts.apiBase ?? DEFAULT_API_BASE;

    const gameMeta = ref<ApiGameMeta | null>(null);
    const gameEvents = ref<ApiGameEvent[]>([]);
    const gameError = ref("");

    const loopState = ref({ phaseId: "DAY_DISCUSSION" as LocalPhaseId, dayNumber: 1, currentSpeakerSeatNumber: 1 });

    const showEndGameConfirm = ref(false);
    const devCollapsed = ref(true);

    const speakDraft = ref("");
    const nominateDraft = ref("");
    const voteSelection = ref<number | null>(null);
    const yesNoSelection = ref<"YES" | "NO" | null>(null);

    const devPhaseTo = ref<LocalPhaseId>("DAY_DISCUSSION");

    type AiLogEntry = {
        id: string;
        createdAt: string;
        request: any;
        response?: any;
        error?: string;
    };

    const aiLogs = ref<AiLogEntry[]>([]);
    const aiBusy = ref(false);

    const sse = ref<EventSource | null>(null);
    const timerTick = ref(0);
    // Keys: "p1".."p10" for players, and "host" for host bubble.
    const bubbleBySeat = ref<Map<string, Bubble>>(new Map());

    // Host bubbles should be readable even when host sends multiple messages quickly.
    // We queue host bubble texts and show them sequentially.
    let hostBubbleRunning = false;
    const hostBubbleQueue: Array<{ text: string; ms: number }> = [];

    const voteIconUrl = new URL("../assets/images/icons/vote.svg", import.meta.url).href;
    const sightIconUrl = new URL("../assets/images/icons/sight.svg", import.meta.url).href;

    const aliveSeatNumbers = computed(() => Array.from(aliveSeatsFromEvents(gameEvents.value)).sort((a, b) => a - b));
    const aliveSet = computed(() => new Set(aliveSeatNumbers.value));

    function shuffle<T>(arr: T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function makeRolePool(): RoleId[] {
        // 10 players: 1 boss, 2 mafia, 1 sheriff, rest town.
        return ["MAFIA_BOSS", "MAFIA", "MAFIA", "SHERIFF", "TOWN", "TOWN", "TOWN", "TOWN", "TOWN", "TOWN"];
    }

    const gameSetup = computed(() => {
        const ev = gameEvents.value.find((e) => e.type === "GAME_SETUP");
        if (!ev) return null;
        const rolesBySeatRaw = ev.payload?.rolesBySeat;
        const rolesBySeat = new Map<number, RoleId>();
        if (rolesBySeatRaw && typeof rolesBySeatRaw === "object") {
            for (const [k, v] of Object.entries(rolesBySeatRaw as Record<string, any>)) {
                const seat = Number(k);
                if (!Number.isFinite(seat)) continue;
                rolesBySeat.set(seat, v as RoleId);
            }
        }
        return { rolesBySeat };
    });

    const roleBySeatNumber = (seatNumber: number): RoleId => {
        const r = gameSetup.value?.rolesBySeat.get(seatNumber);
        return r ?? "TOWN";
    };

    const mafiaSeatNumbers = computed(() => {
        return aliveSeatNumbers.value.filter((s) => {
            const r = roleBySeatNumber(s);
            return r === "MAFIA" || r === "MAFIA_BOSS";
        });
    });

    const bossSeatNumber = computed<number | null>(() => {
        const aliveBoss = aliveSeatNumbers.value.find((s) => roleBySeatNumber(s) === "MAFIA_BOSS");
        return aliveBoss ?? null;
    });

    const sheriffSeatNumber = computed<number | null>(() => {
        const aliveSheriff = aliveSeatNumbers.value.find((s) => roleBySeatNumber(s) === "SHERIFF");
        return aliveSheriff ?? null;
    });

    const actingBossSeatNumber = computed<number | null>(() => {
        if (bossSeatNumber.value != null) return bossSeatNumber.value;
        const mafia = mafiaSeatNumbers.value;
        return mafia.length ? mafia[mafia.length - 1] : null;
    });

    const nominees = computed(() => nomineesFromDiscussion(gameEvents.value, aliveSet.value));
    const tieCandidates = computed(() => tieCandidatesFromPhaseChange(gameEvents.value, loopState.value.phaseId));
    const eliminationQueue = computed(() => eliminationQueueFromPhaseChange(gameEvents.value, loopState.value.phaseId));

    const voteOptions = computed(() => {
        const phase = loopState.value.phaseId;
        const candidates = phase === "DAY_VOTING" ? nominees.value : phase === "TIE_REVOTE" ? tieCandidates.value : [];
        return candidates.map((seatNo) => ({ label: `#${seatNo} ${seatLabel(seatNo)}`, value: seatNo }));
    });

    const voteCountBySeat = computed(() => {
        const phase = loopState.value.phaseId;
        if (!(phase === "DAY_VOTING" || phase === "TIE_REVOTE")) return new Map<number, number>();
        const candidates = phase === "DAY_VOTING" ? nominees.value : tieCandidates.value;
        return voteCounts(gameEvents.value, phase, candidates);
    });

    const eliminationIconUrlBySeat = computed(() => {
        const m = new Map<number, string>();
        for (const ev of gameEvents.value) {
            if (ev.type !== "PLAYER_ELIMINATED") continue;
            const seat = Number(ev.payload?.seatNumber);
            if (!Number.isFinite(seat)) continue;
            const reason = String(ev.payload?.reason ?? "");
            if (reason === "VOTE" || reason === "MASS_ELIMINATION") m.set(seat, voteIconUrl);
            else m.set(seat, sightIconUrl);
        }
        return m;
    });

    const canSpeak = computed(() => {
        const p = loopState.value.phaseId;
        if (gameMeta.value?.endedAt) return false;
        return (
            p === "DAY_DISCUSSION" ||
            p === "TIE_DISCUSSION" ||
            p === "ELIMINATION_SPEECH" ||
            p === "NIGHT_MAFIA_DISCUSSION" ||
            p === "NIGHT_MAFIA_BOSS_GUESS" ||
            p === "NIGHT_SHERIFF_ACTION"
        );
    });

    const canFinishTurn = computed(() => {
        const p = loopState.value.phaseId;
        if (gameMeta.value?.endedAt) return false;
        return (
            p === "DAY_DISCUSSION" ||
            p === "TIE_DISCUSSION" ||
            p === "ELIMINATION_SPEECH" ||
            p === "NIGHT_MAFIA_DISCUSSION" ||
            p === "NIGHT_MAFIA_BOSS_GUESS" ||
            p === "NIGHT_SHERIFF_ACTION"
        );
    });

    const canNominatePhase = computed(() => loopState.value.phaseId === "DAY_DISCUSSION" && !gameMeta.value?.endedAt);
    const canNominate = computed(() => {
        const n = Number.parseInt(nominateDraft.value, 10);
        if (!(Number.isInteger(n) && n >= 1 && n <= 10)) return false;
        const speaker = loopState.value.currentSpeakerSeatNumber;
        if (hasNominatedThisTurn(speaker)) return false;
        return true;
    });

    const gameTimerText = computed(() => {
        void timerTick.value;
        const meta = gameMeta.value;
        if (!meta?.createdAt) return "--:--";
        const start = Date.parse(meta.createdAt);
        const end = meta.endedAt ? Date.parse(meta.endedAt) : Date.now();
        if (!Number.isFinite(start) || !Number.isFinite(end)) return "--:--";
        return formatDuration(end - start);
    });

    const chatMessages = computed<ChatMessage[]>(() =>
        buildChatMessages({
            meta: gameMeta.value,
            events: gameEvents.value,
            seatLabel,
            lobbySeatLines: opts.lobbySeatLines(),
        })
    );

    function playerBySeat(seatNumber: number) {
        return gameMeta.value?.players?.find((p) => p.seatNumber === seatNumber);
    }

    function seatLabel(seatNumber: number) {
        const p = playerBySeat(seatNumber);
        return p?.name ?? `Seat #${seatNumber}`;
    }

    function presetById(id: string) {
        return PLAYERS_PRESET.find((p) => p.id === id);
    }

    function roleLogFor(roleId: RoleId, texts: ReturnType<typeof buildRoleLogTexts>) {
        if (roleId === "SHERIFF") return texts.sheriff;
        if (roleId === "MAFIA") return texts.mafia;
        if (roleId === "MAFIA_BOSS") return texts.boss;
        return texts.town;
    }

    async function requestAi() {
        gameError.value = "";
        if (aiBusy.value) return null;
        const g = gameMeta.value;
        if (!g) return null;
        if (g.endedAt) {
            gameError.value = "Game has ended";
            return null;
        }
        if (loopState.value.phaseId !== "DAY_DISCUSSION") {
            gameError.value = "AI is only wired for DAY_DISCUSSION right now.";
            return null;
        }

        const seatNumber = loopState.value.currentSpeakerSeatNumber;
        const player = playerBySeat(seatNumber);
        if (!player) {
            gameError.value = `No player found for seat #${seatNumber}`;
            return null;
        }

        const roleId = roleBySeatNumber(seatNumber);
        const preset = presetById(player.id);

        const roleLogs = buildRoleLogTexts({ meta: g, events: gameEvents.value });
        const roleLogText = roleLogFor(roleId, roleLogs);

        const request = {
            action: "DAY_DISCUSSION_SPEAK" as const,
            phaseId: loopState.value.phaseId,
            gameId: g.id,
            roleLogText,
            aliveSeatNumbers: aliveSeatNumbers.value,
            persona: {
                seatNumber,
                roleId,
                name: player.name,
                nickname: player.nickname,
                profile: preset?.profile ?? "",
            },
        };

        const logId = crypto.randomUUID();
        aiLogs.value = [...aiLogs.value, { id: logId, createdAt: new Date().toISOString(), request }];

        try {
            aiBusy.value = true;
            const resp = await requestAiAct(apiBase, request);
            aiLogs.value = aiLogs.value.map((x) => (x.id === logId ? { ...x, response: resp } : x));

            if (!resp.parsed) {
                gameError.value = resp.parseError ?? "AI response could not be parsed.";
                return resp;
            }

            const say = resp.parsed.say?.trim();
            if (say) {
                await appendEvent({
                    type: "PLAYER_SPEAK",
                    kind: "player",
                    payload: { seatNumber, text: say },
                });
            }

            const nominate = resp.parsed.nominateSeatNumber;
            if (
                typeof nominate === "number" &&
                Number.isInteger(nominate) &&
                nominate >= 1 &&
                nominate <= 10 &&
                aliveSet.value.has(nominate)
            ) {
                await appendEvent({
                    type: "PLAYER_NOMINATE",
                    kind: "system",
                    payload: { seatNumber, targetSeatNumber: nominate },
                });
            }

            // After the AI has acted, automatically end this speaker's turn (same as clicking "Finish turn").
            await onEndTurn();

            return resp;
        } catch (err: any) {
            const message = err?.message ?? String(err);
            aiLogs.value = aiLogs.value.map((x) => (x.id === logId ? { ...x, error: message } : x));
            gameError.value = message;
            return null;
        } finally {
            aiBusy.value = false;
        }
    }

    function seatLabelWithNick(seatNumber: number) {
        const p = playerBySeat(seatNumber);
        if (!p) return `Seat #${seatNumber}`;
        return p.nickname ? `${p.name} (${p.nickname})` : p.name;
    }

    function recomputeLoop() {
        loopState.value = rebuildLoopStateFromEvents(gameEvents.value);
    }

    async function loadEvents(gameId: string) {
        const events = await getGameEvents(apiBase, gameId);
        gameEvents.value = events;
        recomputeLoop();
    }

    async function appendEvent(e: { type: ApiGameEvent["type"]; kind: ApiGameEvent["kind"]; payload: any }) {
        gameError.value = "";
        const g = gameMeta.value;
        if (!g) return null;
        try {
            const created = await appendGameEvent(apiBase, g.id, e);
            if (!gameEvents.value.some((x) => x.id === created.id)) {
                gameEvents.value = [...gameEvents.value, created];
                recomputeLoop();
            }
            showBubbleForEvent(created);
            return created;
        } catch (err: any) {
            gameError.value = err?.message ?? String(err);
            return null;
        }
    }

    function connectSse(gameId: string) {
        if (sse.value) {
            try {
                sse.value.close();
            } catch {
                // ignore
            }
        }
        const es = connectGameSse(apiBase, gameId, (incoming) => {
            if (gameEvents.value.some((e) => e.id === incoming.id)) return;
            gameEvents.value = [...gameEvents.value, incoming];
            recomputeLoop();
            showBubbleForEvent(incoming);
        });
        es.onerror = () => {
            // keep last known state
        };
        sse.value = es;
    }

    async function createNewGame() {
        gameError.value = "";
        try {
            const payload = opts.createPayload();
            const meta = await createGame(apiBase, payload);
            gameMeta.value = meta;
            localStorage.setItem("mafia.activeGameId", meta.id);
            await loadEvents(meta.id);
            connectSse(meta.id);

            // Persist roles once so night mechanics + win checks survive refresh and are saved in DB.
            if (!gameEvents.value.some((ev) => ev.type === "GAME_SETUP")) {
                const roles = shuffle(makeRolePool());
                const rolesBySeat: Record<string, RoleId> = {};
                for (let seat = 1; seat <= 10; seat++) rolesBySeat[String(seat)] = roles[seat - 1];
                await appendEvent({ type: "GAME_SETUP", kind: "system", payload: { rolesBySeat } });
            }

            // welcome
            if (!gameEvents.value.some((ev) => ev.type === "HOST_MESSAGE" && ev.payload?.tag === "WELCOME")) {
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { tag: "WELCOME", text: "Welcome to the table. Good luck and have a great game." },
                });
            }

            if (!gameEvents.value.some((ev) => ev.type === "HOST_MESSAGE" && ev.payload?.tag === "DISCUSSION_START")) {
                const first = playerBySeat(1);
                const text = first
                    ? `Day 1 discussion. ${first.name} (${first.nickname}) will speak first.`
                    : "Day 1 discussion begins.";
                await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { tag: "DISCUSSION_START", text } });
            }
        } catch (e: any) {
            gameError.value = e?.message ?? String(e);
        }
    }

    async function resumeGameIfAny() {
        gameError.value = "";
        try {
            const active = await getActiveGame(apiBase);
            if (active && !active.endedAt) {
                gameMeta.value = active;
                localStorage.setItem("mafia.activeGameId", active.id);
                await loadEvents(active.id);
                connectSse(active.id);
                return;
            }
        } catch {
            // ignore
        }

        const storedId = localStorage.getItem("mafia.activeGameId");
        if (storedId) {
            try {
                const g = await getGameMeta(apiBase, storedId);
                if (!g.endedAt) {
                    gameMeta.value = g;
                    await loadEvents(g.id);
                    connectSse(g.id);
                    return;
                }
            } catch {
                // ignore
            }
        }

        await createNewGame();
    }

    function showBubble(key: string, text: string, ms = 4500) {
        const until = Date.now() + ms;
        const next = new Map(bubbleBySeat.value);
        next.set(key, { text, until });
        bubbleBySeat.value = next;
    }

    function estimateHostBubbleMs(text: string) {
        // Simple reading-time heuristic:
        // - base time for context switching
        // - additional time proportional to message length
        // - capped to avoid sluggish UI on very long texts
        const trimmed = text.trim();
        const chars = trimmed.length;
        const words = trimmed ? trimmed.split(/\s+/).length : 0;

        const base = 900; // ms
        const perWord = 230; // ms
        const perChar = 14; // ms

        const ms = base + words * perWord + chars * perChar;
        return Math.max(1400, Math.min(6500, Math.round(ms)));
    }

    function enqueueHostBubble(text: string, ms?: number) {
        hostBubbleQueue.push({ text, ms: ms ?? estimateHostBubbleMs(text) });
        void pumpHostBubbleQueue();
    }

    async function pumpHostBubbleQueue() {
        if (hostBubbleRunning) return;
        const item = hostBubbleQueue.shift();
        if (!item) return;
        hostBubbleRunning = true;

        // If host sends many messages quickly, don't make players read stale bubbles for minutes.
        // Speed up playback as the backlog grows (but keep a readable minimum time per bubble).
        const backlog = hostBubbleQueue.length;
        const speedup = Math.min(4, 1 + backlog * 0.25); // 0 backlog => 1x, 4 backlog => 2x, 12 backlog => 4x (cap)
        const effectiveMs = Math.max(900, Math.round(item.ms / speedup));

        showBubble("host", item.text, effectiveMs);
        window.setTimeout(() => {
            hostBubbleRunning = false;
            void pumpHostBubbleQueue();
        }, effectiveMs + 50);
    }

    async function announceDayDiscussionStart() {
        const day = loopState.value.dayNumber ?? 1;
        const firstSeat = loopState.value.currentSpeakerSeatNumber ?? 1;
        const first = playerBySeat(firstSeat);
        const text = first
            ? `Day ${day} discussion. ${first.name} (${first.nickname}) will speak first.`
            : `Day ${day} discussion begins.`;
        await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { tag: "DISCUSSION_START", text } });
    }

    function showBubbleForEvent(ev: ApiGameEvent) {
        if (ev.type === "HOST_MESSAGE") {
            const text = String(ev.payload?.text ?? "").trim();
            if (text) enqueueHostBubble(text);
            return;
        }

        if (ev.type === "PLAYER_SPEAK") {
            const seat = Number(ev.payload?.seatNumber);
            const text = String(ev.payload?.text ?? "").trim();
            if (Number.isFinite(seat) && text) showBubble(`p${seat}`, text);
            return;
        }

        if (ev.type === "PLAYER_VOTE") {
            const voter = Number(ev.payload?.voterSeatNumber);
            const target = Number(ev.payload?.targetSeatNumber);
            if (!Number.isFinite(voter) || !Number.isFinite(target)) return;
            showBubble(`p${voter}`, `I vote for ${seatLabel(target)}`);
            return;
        }

        if (ev.type === "MASS_ELIMINATION_VOTE") {
            const voter = Number(ev.payload?.voterSeatNumber);
            const vote = ev.payload?.vote === "YES" ? "YES" : ev.payload?.vote === "NO" ? "NO" : null;
            if (!Number.isFinite(voter) || !vote) return;
            const line =
                vote === "YES"
                    ? "I vote YES — eliminate all tied candidates."
                    : "I vote NO — keep everyone in the game.";
            showBubble(`p${voter}`, line);
        }
    }

    function onSpeak() {
        const text = speakDraft.value.trim();
        if (!text) return;
        void appendEvent({
            type: "PLAYER_SPEAK",
            kind: "player",
            payload: { seatNumber: loopState.value.currentSpeakerSeatNumber, text },
        });
        speakDraft.value = "";
    }

    function onNominate() {
        const n = Number.parseInt(nominateDraft.value, 10);
        if (!Number.isInteger(n)) return;
        void appendEvent({
            type: "PLAYER_NOMINATE",
            kind: "system",
            payload: { seatNumber: loopState.value.currentSpeakerSeatNumber, targetSeatNumber: n },
        });
        nominateDraft.value = "";
    }

    function votesInCurrentPhase(): Map<number, number> {
        const phase = loopState.value.phaseId;
        const w = phaseWindowEvents(gameEvents.value, phase);
        const m = new Map<number, number>();
        for (const ev of w) {
            if (ev.type !== "PLAYER_VOTE") continue;
            const voter = Number(ev.payload?.voterSeatNumber);
            const target = Number(ev.payload?.targetSeatNumber);
            if (Number.isFinite(voter) && Number.isFinite(target)) m.set(voter, target);
        }
        return m;
    }

    function massVotesInCurrentPhase(): Map<number, "YES" | "NO"> {
        const w = phaseWindowEvents(gameEvents.value, "MASS_ELIMINATION_PROPOSAL");
        const m = new Map<number, "YES" | "NO">();
        for (const ev of w) {
            if (ev.type === "MASS_ELIMINATION_VOTE") {
                const voter = Number(ev.payload?.voterSeatNumber);
                const vote = ev.payload?.vote;
                if (Number.isFinite(voter) && (vote === "YES" || vote === "NO")) m.set(voter, vote);
            }
        }
        return m;
    }

    async function onVote() {
        const phase = loopState.value.phaseId;
        if (!(phase === "DAY_VOTING" || phase === "TIE_REVOTE")) return;
        if (voteSelection.value == null) return;
        const voter = loopState.value.currentSpeakerSeatNumber;
        await appendEvent({
            type: "PLAYER_VOTE",
            kind: "player",
            payload: { voterSeatNumber: voter, targetSeatNumber: voteSelection.value },
        });
        voteSelection.value = null;
        await onVoteTurnEnded();
    }

    function hasNominatedThisTurn(seatNumber: number): boolean {
        const w = phaseWindowEvents(gameEvents.value, "DAY_DISCUSSION");
        let lastTurnEndIdx = -1;
        for (let i = w.length - 1; i >= 0; i--) {
            const ev = w[i];
            if (ev.type === "TURN_ENDED" && Number(ev.payload?.seatNumber) === seatNumber) {
                lastTurnEndIdx = i;
                break;
            }
        }
        for (let i = lastTurnEndIdx + 1; i < w.length; i++) {
            const ev = w[i];
            if (ev.type === "PLAYER_NOMINATE" && Number(ev.payload?.seatNumber) === seatNumber) return true;
        }
        return false;
    }

    async function onVoteTurnEnded() {
        const phase = loopState.value.phaseId;
        const voter = loopState.value.currentSpeakerSeatNumber;
        await appendEvent({ type: "TURN_ENDED", kind: "system", payload: { seatNumber: voter } });

        const alive = aliveSeatNumbers.value;
        const idx = alive.indexOf(voter);
        const isLast = idx === alive.length - 1;

        if (!isLast) {
            const next = alive[idx + 1];
            await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: `Seat #${next}, please vote.` } });
            return;
        }

        const candidates = phase === "DAY_VOTING" ? nominees.value : tieCandidates.value;
        const votes = votesInCurrentPhase();
        const counts = new Map<number, number>();
        for (const c of candidates) counts.set(c, 0);
        for (const target of votes.values()) {
            if (counts.has(target)) counts.set(target, (counts.get(target) ?? 0) + 1);
        }

        const tallyLines = candidates.map((c) => `${seatLabel(c)}: ${counts.get(c) ?? 0}`).join(", ");
        await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: `Vote tally: ${tallyLines}.` } });

        const max = Math.max(...candidates.map((c) => counts.get(c) ?? 0));
        const top = candidates.filter((c) => (counts.get(c) ?? 0) === max);

        if (top.length === 1) {
            const target = top[0];
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: `${seatLabel(target)} is eliminated.` },
            });
            await appendEvent({
                type: "PLAYER_ELIMINATED",
                kind: "system",
                payload: { seatNumber: target, reason: "VOTE" },
            });
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: phase, to: "ELIMINATION_SPEECH", eliminated: [target] },
            });
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: `Final words: ${seatLabel(target)}.` },
            });
            return;
        }

        const names = top.map((c) => seatLabel(c)).join(", ");

        // Tie handling differs by phase:
        // - DAY_VOTING tie → TIE_DISCUSSION (candidates speak) → TIE_REVOTE
        // - TIE_REVOTE tie → MASS_ELIMINATION_PROPOSAL (YES/NO to eliminate all tied candidates)
        if (phase === "DAY_VOTING") {
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: `Tie between: ${names}. They will speak, then we revote.` },
            });
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: phase, to: "TIE_DISCUSSION", candidates: top },
            });
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: `Tie discussion begins. ${seatLabelWithNick(top[0])} will speak.` },
            });
            return;
        }

        await appendEvent({
            type: "HOST_MESSAGE",
            kind: "host",
            payload: {
                text: `Still tied after revote (${max} votes): ${names}. Mass elimination proposal begins (vote YES/NO).`,
            },
        });
        await appendEvent({
            type: "PHASE_CHANGED",
            kind: "system",
            payload: { from: phase, to: "MASS_ELIMINATION_PROPOSAL", candidates: top },
        });
        const firstVoter = aliveSeatNumbers.value[0] ?? 1;
        await appendEvent({
            type: "HOST_MESSAGE",
            kind: "host",
            payload: { text: `Seat #${firstVoter}, vote YES/NO.` },
        });
        return;
    }

    async function onProposalVote() {
        if (loopState.value.phaseId !== "MASS_ELIMINATION_PROPOSAL") return;
        if (!yesNoSelection.value) return;
        const voter = loopState.value.currentSpeakerSeatNumber;
        await appendEvent({
            type: "MASS_ELIMINATION_VOTE",
            kind: "system",
            payload: { voterSeatNumber: voter, vote: yesNoSelection.value },
        });
        yesNoSelection.value = null;
        await appendEvent({ type: "TURN_ENDED", kind: "system", payload: { seatNumber: voter } });

        const alive = aliveSeatNumbers.value;
        const idx = alive.indexOf(voter);
        const isLast = idx === alive.length - 1;

        if (!isLast) {
            const next = alive[idx + 1];
            await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: `Seat #${next}, vote YES/NO.` } });
            return;
        }

        const votes = massVotesInCurrentPhase();
        let yes = 0;
        for (const v of votes.values()) if (v === "YES") yes++;

        const candidates = tieCandidates.value;
        if (yes > alive.length / 2) {
            const names = candidates.map((n) => seatLabel(n)).join(", ");
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: `Majority YES. Eliminating: ${names}.` },
            });
            for (const c of candidates) {
                await appendEvent({
                    type: "PLAYER_ELIMINATED",
                    kind: "system",
                    payload: { seatNumber: c, reason: "MASS_ELIMINATION" },
                });
            }
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "MASS_ELIMINATION_PROPOSAL", to: "ELIMINATION_SPEECH", eliminated: candidates },
            });
            const first = candidates[0];
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: `Final words: ${seatLabel(first)}.` },
            });
            return;
        }

        await appendEvent({
            type: "HOST_MESSAGE",
            kind: "host",
            payload: { text: "Majority NO. No one is eliminated. Night falls." },
        });
        const mafia = mafiaSeatNumbers.value;
        await appendEvent({
            type: "PHASE_CHANGED",
            kind: "system",
            payload: { from: "MASS_ELIMINATION_PROPOSAL", to: "NIGHT_MAFIA_DISCUSSION", speakers: mafia },
        });
        await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "Mafia wake up." } });
    }

    function nightKillSelectedTarget(): number | null {
        const w = phaseWindowEvents(gameEvents.value, "NIGHT_MAFIA_DISCUSSION");
        for (let i = w.length - 1; i >= 0; i--) {
            const ev = w[i];
            if (ev.type === "NIGHT_KILL_SELECT") {
                const t = Number(ev.payload?.targetSeatNumber);
                if (Number.isFinite(t)) return t;
            }
        }
        return null;
    }

    async function resolveNightAndStartDay() {
        const nightPhase = loopState.value.phaseId;
        const kill = nightKillSelectedTarget();
        const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

        // 1) Host wake-up line (still night visuals)
        await appendEvent({
            type: "HOST_MESSAGE",
            kind: "host",
            payload: { text: "Morning comes. Everyone wakes up." },
        });
        await sleep(750);

        // 2) Flip to a non-night phase so everyone visually wakes up (unmask).
        await appendEvent({
            type: "PHASE_CHANGED",
            kind: "system",
            payload: { from: nightPhase, to: "MORNING_REVEAL" },
        });
        await sleep(750);

        // 3) Announce outcome, then transition to next phase.
        if (kill != null && aliveSet.value.has(kill)) {
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: `${seatLabel(kill)} was killed during the night.` },
            });
            await sleep(650);
            await appendEvent({
                type: "PLAYER_ELIMINATED",
                kind: "system",
                payload: { seatNumber: kill, reason: "MAFIA" },
            });
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "MORNING_REVEAL", to: "ELIMINATION_SPEECH", eliminated: [kill] },
            });
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: `Final words: ${seatLabel(kill)}.` },
            });
            return;
        }

        await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "No one was killed tonight." } });
        await sleep(650);
        await appendEvent({
            type: "PHASE_CHANGED",
            kind: "system",
            payload: { from: "MORNING_REVEAL", to: "DAY_DISCUSSION" },
        });
        await announceDayDiscussionStart();
    }

    async function checkWinAndMaybeEnd() {
        const alive = aliveSeatNumbers.value;
        let mafia = 0;
        let town = 0;
        for (const s of alive) {
            const r = roleBySeatNumber(s);
            if (r === "MAFIA" || r === "MAFIA_BOSS") mafia++;
            else town++;
        }

        if (mafia === 0) {
            await appendEvent({ type: "WIN_RESULT", kind: "system", payload: { winner: "TOWN" } });
            await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "Town wins!" } });
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "WIN_CHECK", to: "GAME_END" },
            });
            return;
        }
        if (mafia >= town) {
            await appendEvent({ type: "WIN_RESULT", kind: "system", payload: { winner: "MAFIA" } });
            await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "Mafia wins!" } });
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "WIN_CHECK", to: "GAME_END" },
            });
            return;
        }
    }

    const nightKillOptions = computed(() => {
        return aliveSeatNumbers.value
            .filter((s) => {
                const r = roleBySeatNumber(s);
                return r !== "MAFIA" && r !== "MAFIA_BOSS";
            })
            .map((s) => ({ label: `#${s} ${seatLabel(s)}`, value: s }));
    });

    const nightGuessOptions = computed(() =>
        aliveSeatNumbers.value.map((s) => ({ label: `#${s} ${seatLabel(s)}`, value: s }))
    );

    function canActAsBossNow(): boolean {
        return (
            loopState.value.phaseId === "NIGHT_MAFIA_DISCUSSION" &&
            loopState.value.currentSpeakerSeatNumber === actingBossSeatNumber.value
        );
    }

    async function onNightSuggestTarget(targetSeatNumber: number) {
        if (loopState.value.phaseId !== "NIGHT_MAFIA_DISCUSSION") return;
        const seatNumber = loopState.value.currentSpeakerSeatNumber;
        await appendEvent({ type: "NIGHT_KILL_SUGGEST", kind: "player", payload: { seatNumber, targetSeatNumber } });
    }

    async function onNightSelectKillTarget(targetSeatNumber: number) {
        if (!canActAsBossNow()) return;
        const seatNumber = loopState.value.currentSpeakerSeatNumber;
        await appendEvent({ type: "NIGHT_KILL_SELECT", kind: "player", payload: { seatNumber, targetSeatNumber } });
        await appendEvent({
            type: "HOST_MESSAGE",
            kind: "host",
            payload: { text: `Kill target selected: ${seatLabel(targetSeatNumber)}.` },
        });
    }

    async function onBossGuess(targetSeatNumber: number) {
        if (loopState.value.phaseId !== "NIGHT_MAFIA_BOSS_GUESS") return;
        const boss = bossSeatNumber.value;
        if (boss == null) return; // if the real boss is dead, there is no boss check
        const isSheriff = roleBySeatNumber(targetSeatNumber) === "SHERIFF";
        await appendEvent({
            type: "NIGHT_BOSS_GUESS",
            kind: "player",
            payload: { seatNumber: boss, targetSeatNumber, isSheriff },
        });
        await appendEvent({
            type: "HOST_MESSAGE",
            kind: "host",
            payload: {
                text: isSheriff
                    ? `${seatLabel(targetSeatNumber)} is the Sheriff.`
                    : `${seatLabel(targetSeatNumber)} is NOT the Sheriff.`,
            },
        });

        const sheriff = sheriffSeatNumber.value;
        if (sheriff == null) {
            await resolveNightAndStartDay();
            return;
        }
        await appendEvent({
            type: "PHASE_CHANGED",
            kind: "system",
            payload: { from: "NIGHT_MAFIA_BOSS_GUESS", to: "NIGHT_SHERIFF_ACTION", speakers: [sheriff] },
        });
        await appendEvent({
            type: "HOST_MESSAGE",
            kind: "host",
            payload: { text: `${seatLabel(sheriff)} (Sheriff) is awake. Choose someone to investigate.` },
        });
    }

    async function onSheriffInvestigate(targetSeatNumber: number) {
        if (loopState.value.phaseId !== "NIGHT_SHERIFF_ACTION") return;
        const sheriff = sheriffSeatNumber.value;
        if (sheriff == null) return;
        const r = roleBySeatNumber(targetSeatNumber);
        const isMafia = r === "MAFIA" || r === "MAFIA_BOSS";
        await appendEvent({
            type: "NIGHT_SHERIFF_INVESTIGATE",
            kind: "player",
            payload: { seatNumber: sheriff, targetSeatNumber, isMafia },
        });
        await appendEvent({
            type: "HOST_MESSAGE",
            kind: "host",
            payload: {
                text: isMafia ? `${seatLabel(targetSeatNumber)} is MAFIA.` : `${seatLabel(targetSeatNumber)} is TOWN.`,
            },
        });
        await resolveNightAndStartDay();
    }

    function bossLastOrder(seats: number[]) {
        const boss = bossSeatNumber.value;
        const arr = [...seats].sort((a, b) => a - b);
        if (boss == null) return arr;
        const i = arr.indexOf(boss);
        if (i >= 0) arr.splice(i, 1);
        arr.push(boss);
        return arr;
    }

    function defaultPhasePayload(to: LocalPhaseId) {
        const from = loopState.value.phaseId;
        if (to === "NIGHT_MAFIA_DISCUSSION") return { from, to, speakers: bossLastOrder(mafiaSeatNumbers.value) };
        if (to === "NIGHT_MAFIA_BOSS_GUESS")
            return { from, to, speakers: bossSeatNumber.value != null ? [bossSeatNumber.value] : [] };
        if (to === "NIGHT_SHERIFF_ACTION")
            return { from, to, speakers: sheriffSeatNumber.value != null ? [sheriffSeatNumber.value] : [] };
        if (to === "DAY_VOTING") return { from, to, candidates: nominees.value };
        if (to === "TIE_DISCUSSION" || to === "TIE_REVOTE" || to === "MASS_ELIMINATION_PROPOSAL")
            return { from, to, candidates: tieCandidates.value };
        if (to === "ELIMINATION_SPEECH") return { from, to, eliminated: eliminationQueue.value };
        return { from, to };
    }

    async function devSwitchPhase() {
        const to = devPhaseTo.value;
        const payload = defaultPhasePayload(to);
        await appendEvent({ type: "PHASE_CHANGED", kind: "system", payload });

        if (to === "NIGHT_MAFIA_DISCUSSION") {
            const speakers: number[] = Array.isArray((payload as any).speakers)
                ? (payload as any).speakers
                : bossLastOrder(mafiaSeatNumbers.value);
            const first = speakers[0];
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: "The town goes to sleep. The streets are empty. Night begins." },
            });
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: "Mafia need to decide who to kill." },
            });
            if (Number.isFinite(first)) {
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { text: `${seatLabelWithNick(first)} will speak first.` },
                });
            }
            return;
        }
    }

    async function onEndTurn() {
        const seat = loopState.value.currentSpeakerSeatNumber;
        await appendEvent({ type: "TURN_ENDED", kind: "system", payload: { seatNumber: seat } });

        const phase = loopState.value.phaseId;

        if (phase === "DAY_DISCUSSION") {
            const alive = aliveSeatNumbers.value;
            const idx = alive.indexOf(seat);
            const isLast = idx === alive.length - 1;

            if (!isLast) {
                const nextSeat = alive[idx + 1];
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { text: `Thank you ${seatLabel(seat)}. Now ${seatLabelWithNick(nextSeat)} will speak.` },
                });
                return;
            }

            if (nominees.value.length === 0) {
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { text: "No one was nominated today. Moving to the night phase." },
                });
                const mafia = mafiaSeatNumbers.value;
                await appendEvent({
                    type: "PHASE_CHANGED",
                    kind: "system",
                    payload: { from: "DAY_DISCUSSION", to: "NIGHT_MAFIA_DISCUSSION", speakers: mafia },
                });
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { text: "Night falls. Mafia wake up." },
                });
                return;
            }

            if (nominees.value.length === 1) {
                const target = nominees.value[0];
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { text: `${seatLabel(target)} was the only nominee and will be eliminated.` },
                });
                await appendEvent({
                    type: "PLAYER_ELIMINATED",
                    kind: "system",
                    payload: { seatNumber: target, reason: "VOTE" },
                });
                await appendEvent({
                    type: "PHASE_CHANGED",
                    kind: "system",
                    payload: { from: "DAY_DISCUSSION", to: "ELIMINATION_SPEECH", eliminated: [target] },
                });
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { text: `Final words: ${seatLabel(target)}.` },
                });
                return;
            }

            const list = nominees.value.map((n) => seatLabel(n)).join(", ");
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: `Voting begins. Candidates: ${list}.` },
            });
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "DAY_DISCUSSION", to: "DAY_VOTING", candidates: nominees.value },
            });
            const firstVoter = alive[0] ?? 1;
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: `Seat #${firstVoter}, please vote.` },
            });
            return;
        }

        if (phase === "TIE_DISCUSSION") {
            const c = tieCandidates.value;
            const idx = c.indexOf(seat);
            const isLast = idx === c.length - 1;
            if (!isLast) {
                const nextSeat = c[idx + 1];
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { text: `Next: ${seatLabel(nextSeat)} will speak.` },
                });
                return;
            }
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: "Tie discussion complete. Revote begins." },
            });
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "TIE_DISCUSSION", to: "TIE_REVOTE", candidates: c },
            });
            const firstVoter = aliveSeatNumbers.value[0] ?? 1;
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: `Seat #${firstVoter}, please vote.` },
            });
            return;
        }

        if (phase === "ELIMINATION_SPEECH") {
            // Elimination speeches can happen for different reasons:
            // - Day elimination(s) (vote / mass elimination) → continue to night after WIN_CHECK
            // - Night kill (via MORNING_REVEAL) → continue to next day after WIN_CHECK
            const eliminationSpeechFrom = (() => {
                const w = phaseWindowEvents(gameEvents.value, "ELIMINATION_SPEECH");
                for (const ev of w) {
                    if (ev.type === "PHASE_CHANGED" && ev.payload?.to === "ELIMINATION_SPEECH") {
                        return ev.payload?.from as LocalPhaseId | undefined;
                    }
                }
                return undefined;
            })();

            const q = eliminationQueue.value;
            const idx = q.indexOf(seat);
            const isLast = idx === q.length - 1;
            if (!isLast) {
                const nextSeat = q[idx + 1];
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { text: `Final words: ${seatLabel(nextSeat)}.` },
                });
                return;
            }
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "ELIMINATION_SPEECH", to: "WIN_CHECK" },
            });
            await checkWinAndMaybeEnd();
            if (loopState.value.phaseId === "GAME_END") return;

            if (eliminationSpeechFrom === "MORNING_REVEAL") {
                await appendEvent({
                    type: "PHASE_CHANGED",
                    kind: "system",
                    payload: { from: "WIN_CHECK", to: "DAY_DISCUSSION" },
                });
                await announceDayDiscussionStart();
                return;
            }

            const mafia = [...mafiaSeatNumbers.value].sort((a, b) => a - b);
            const boss = bossSeatNumber.value;
            if (boss != null) {
                const i = mafia.indexOf(boss);
                if (i >= 0) mafia.splice(i, 1);
                mafia.push(boss);
            }
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "WIN_CHECK", to: "NIGHT_MAFIA_DISCUSSION", speakers: mafia },
            });
            await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "Night falls. Mafia wake up." } });
            return;
        }

        if (phase === "NIGHT_MAFIA_DISCUSSION") {
            const mafia = [...mafiaSeatNumbers.value].sort((a, b) => a - b);
            const boss = bossSeatNumber.value;
            if (boss != null) {
                const i = mafia.indexOf(boss);
                if (i >= 0) mafia.splice(i, 1);
                mafia.push(boss);
            }
            const idx = mafia.indexOf(seat);
            const isLast = idx === mafia.length - 1;
            if (!isLast) {
                const nextSeat = mafia[idx + 1];
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { text: `Next mafia: ${seatLabel(nextSeat)} will speak.` },
                });
                return;
            }

            // Boss check is ONLY available if the real boss is alive.
            if (boss != null) {
                await appendEvent({
                    type: "PHASE_CHANGED",
                    kind: "system",
                    payload: { from: "NIGHT_MAFIA_DISCUSSION", to: "NIGHT_MAFIA_BOSS_GUESS", speakers: [boss] },
                });
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { text: `${seatLabel(boss)} (boss) is awake. Choose someone to check for Sheriff.` },
                });
                return;
            }

            // If boss is dead, skip boss-check entirely; proceed to sheriff (if alive) or morning.
            const sheriff = sheriffSeatNumber.value;
            if (sheriff == null) {
                await resolveNightAndStartDay();
                return;
            }
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "NIGHT_MAFIA_DISCUSSION", to: "NIGHT_SHERIFF_ACTION", speakers: [sheriff] },
            });
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: `${seatLabel(sheriff)} (Sheriff) is awake. Choose someone to investigate.` },
            });
            return;
        }

        if (phase === "NIGHT_MAFIA_BOSS_GUESS") {
            const sheriff = sheriffSeatNumber.value;
            if (sheriff == null) {
                await resolveNightAndStartDay();
                return;
            }
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "NIGHT_MAFIA_BOSS_GUESS", to: "NIGHT_SHERIFF_ACTION", speakers: [sheriff] },
            });
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: `${seatLabel(sheriff)} (Sheriff) is awake. Choose someone to investigate.` },
            });
            return;
        }

        if (phase === "NIGHT_SHERIFF_ACTION") {
            await resolveNightAndStartDay();
            return;
        }
    }

    async function onEndGame() {
        const g = gameMeta.value;
        if (!g) return;
        gameError.value = "";
        try {
            const res = await endGame(apiBase, g.id);
            gameMeta.value = res.game;
            if (!gameEvents.value.some((e) => e.id === res.event.id)) {
                gameEvents.value = [...gameEvents.value, res.event];
                recomputeLoop();
            }
            showEndGameConfirm.value = false;
            localStorage.removeItem("mafia.activeGameId");
            opts.onEnded?.();
        } catch (e: any) {
            gameError.value = e?.message ?? String(e);
        }
    }

    onBeforeUnmount(() => {
        if (sse.value) {
            try {
                sse.value.close();
            } catch {
                // ignore
            }
        }
    });

    onMounted(() => {
        void resumeGameIfAny();
    });

    onMounted(() => {
        const id = window.setInterval(() => {
            timerTick.value++;
            const now = Date.now();
            const next = new Map<string, Bubble>();
            for (const [k, v] of bubbleBySeat.value.entries()) {
                if (v.until > now) next.set(k, v);
            }
            bubbleBySeat.value = next;
        }, 1000);
        return () => window.clearInterval(id);
    });

    return {
        // state
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
        devPhaseTo,

        // derived
        aliveSeatNumbers,
        nominees,
        tieCandidates,
        eliminationQueue,
        voteOptions,
        voteCountBySeat,
        eliminationIconUrlBySeat,
        canSpeak,
        canFinishTurn,
        canNominatePhase,
        canNominate,
        gameTimerText,
        chatMessages,
        roleBySeatNumber,
        mafiaSeatNumbers,
        bossSeatNumber,
        sheriffSeatNumber,
        actingBossSeatNumber,
        nightKillOptions,
        nightGuessOptions,
        canActAsBossNow,

        // actions
        createNewGame,
        resumeGameIfAny,
        appendEvent,
        onSpeak,
        onNominate,
        onVote,
        onProposalVote,
        onEndTurn,
        onEndGame,
        onNightSuggestTarget,
        onNightSelectKillTarget,
        onBossGuess,
        onSheriffInvestigate,
        devSwitchPhase,
        requestAi,
        aiLogs,
        aiBusy,
    };
}
