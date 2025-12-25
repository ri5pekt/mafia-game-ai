import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
    /**
     * Optional selected model to send to the backend for OpenAI calls.
     * Return empty string to omit the model field and let the API decide a default.
     */
    aiModel?: () => string;
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
    const aiPrefetch = ref<
        | {
              seatNumber: number;
              requestKey: string;
              startedAt: number;
              promise: Promise<any>;
              request: any;
              response?: any;
              error?: string;
          }
        | null
    >(null);
    const aiPrefetchSeatNumber = computed(() => aiPrefetch.value?.seatNumber ?? null);
    const aiPrefetchBusy = computed(() => Boolean(aiPrefetch.value && !aiPrefetch.value.response && !aiPrefetch.value.error));

    const autoMode = ref(false);

    // Prevent repeated AI in "one-shot" phases (boss guess / sheriff investigate).
    // Auto-mode can schedule a new request between blocking TTS bubbles, so we need an explicit guard.
    const oneShotAiDoneKeys = new Set<string>();

    const bossNightPlan = ref<
        | {
              // Token of the NIGHT_MAFIA_DISCUSSION phase we captured this plan from.
              nightDiscussionPhaseToken: string;
              bossSeatNumber: number;
              selectKillSeatNumber: number | null;
              guessSheriffSeatNumber: number | null;
              consumedKill: boolean;
              consumedGuess: boolean;
          }
        | null
    >(null);

    const sse = ref<EventSource | null>(null);
    const timerTick = ref(0);
    // Keys: "p1".."p10" for players, and "host" for host bubble.
    const bubbleBySeat = ref<Map<string, Bubble>>(new Map());

    // Text-to-speech playback state (sequential; game waits for the current bubble voice unless skipped).
    const ttsBusy = ref(false);
    const ttsNowKey = ref<string | null>(null);

    type TtsParams = { languageCode: string; voiceName: string; speakingRate: number; pitch: number };
    type SpeechQueueItem = { key: string; text: string; tts: TtsParams; resolve: () => void };

    let speechRunning = false;
    const speechQueue: SpeechQueueItem[] = [];
    const speechPromiseByEventId = new Map<string, Promise<void>>();
    let currentSpeech:
        | {
              key: string;
              controller: AbortController;
              audio: HTMLAudioElement | null;
              url: string | null;
              finish: () => void;
          }
        | null = null;

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
            p === "NIGHT_MAFIA_KILL_SELECT" ||
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
            p === "NIGHT_MAFIA_KILL_SELECT" ||
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

    function buildAiRequestForSeat(seatNumber: number) {
        const g = gameMeta.value;
        if (!g) return null;
        const player = playerBySeat(seatNumber);
        if (!player) return null;
        const roleId = roleBySeatNumber(seatNumber);
        const preset = presetById(player.id);

        const roleLogs = buildRoleLogTexts({ meta: g, events: gameEvents.value });
        const roleLogText = roleLogFor(roleId, roleLogs);

        const phaseId = loopState.value.phaseId;
        const actingBoss = actingBossSeatNumber.value;
        const action =
            phaseId === "DAY_DISCUSSION"
                ? ("DAY_DISCUSSION_SPEAK" as const)
                : phaseId === "DAY_VOTING"
                ? ("DAY_VOTING_VOTE" as const)
                : phaseId === "TIE_REVOTE"
                ? ("TIE_REVOTE_VOTE" as const)
            : phaseId === "MASS_ELIMINATION_PROPOSAL"
                ? ("MASS_ELIMINATION_PROPOSAL_VOTE" as const)
                : phaseId === "ELIMINATION_SPEECH"
                ? ("ELIMINATION_SPEECH_LAST_WORDS" as const)
                : phaseId === "NIGHT_MAFIA_DISCUSSION"
                ? (actingBoss != null && seatNumber === actingBoss
                      ? ("NIGHT_MAFIA_BOSS_DISCUSSION_SELECT_KILL_GUESS_SHERIFF" as const)
                      : ("NIGHT_MAFIA_DISCUSSION_SPEAK" as const))
            : phaseId === "NIGHT_MAFIA_KILL_SELECT"
                ? null // no AI call; use bossNightPlan
                : phaseId === "NIGHT_MAFIA_BOSS_GUESS"
                ? ("NIGHT_MAFIA_BOSS_GUESS_SHERIFF" as const)
                : phaseId === "NIGHT_SHERIFF_ACTION"
                ? ("NIGHT_SHERIFF_INVESTIGATE" as const)
                : null;
        if (!action) return null;

        const voteCandidates =
            phaseId === "DAY_VOTING" ? nominees.value : phaseId === "TIE_REVOTE" ? tieCandidates.value : undefined;
        const massCandidates = phaseId === "MASS_ELIMINATION_PROPOSAL" ? tieCandidates.value : undefined;

        const selectedModel = (opts.aiModel ? String(opts.aiModel() ?? "") : "").trim();

        return {
            ...(selectedModel ? { model: selectedModel } : {}),
            action,
            phaseId,
            gameId: g.id,
            roleLogText:
                phaseId === "DAY_VOTING" || phaseId === "TIE_REVOTE" || phaseId === "MASS_ELIMINATION_PROPOSAL"
                    ? roleLogText
                    : roleLogText,
            aliveSeatNumbers: aliveSeatNumbers.value,
            killTargetSeatNumbers:
                phaseId === "NIGHT_MAFIA_DISCUSSION" ? nightKillOptions.value.map((x) => x.value) : undefined,
            awakeSeatNumbers: phaseId === "NIGHT_MAFIA_DISCUSSION" ? mafiaSeatNumbers.value : undefined,
            investigateTargetSeatNumbers:
                phaseId === "NIGHT_SHERIFF_ACTION"
                    ? aliveSeatNumbers.value.filter((s) => s !== seatNumber)
                    : undefined,
            voteCandidateSeatNumbers: voteCandidates,
            // Reuse voteCandidateSeatNumbers to describe the mass-elimination proposal candidates.
            ...(massCandidates ? { voteCandidateSeatNumbers: massCandidates } : {}),
            persona: {
                seatNumber,
                roleId,
                name: player.name,
                nickname: player.nickname,
                profile: preset?.profile ?? "",
            },
        };
    }

    function nextAliveSeatAfter(seatNumber: number): number | null {
        const alive = aliveSeatNumbers.value;
        const idx = alive.indexOf(seatNumber);
        if (idx === -1) return null;
        const next = alive[idx + 1];
        return Number.isFinite(next) ? next : null;
    }

    function currentPhaseToken(phaseId: LocalPhaseId): string {
        for (let i = gameEvents.value.length - 1; i >= 0; i--) {
            const ev = gameEvents.value[i];
            if (ev.type === "PHASE_CHANGED" && ev.payload?.to === phaseId) return String(ev.id);
        }
        return `start:${phaseId}`;
    }

    function buildPrefetchKey(request: any): string {
        const g = gameMeta.value;
        const gid = g?.id ?? "";
        const selectedModel = (opts.aiModel ? String(opts.aiModel() ?? "") : "").trim();
        return [
            gid,
            String(request?.phaseId ?? ""),
            currentPhaseToken(loopState.value.phaseId),
            String(request?.action ?? ""),
            String(request?.persona?.seatNumber ?? ""),
            selectedModel,
        ].join("|");
    }

    function startPrefetchForSeat(seatNumber: number) {
        // Prefetch is only wired for phases where AI logic exists.
        const phase = loopState.value.phaseId;
        if (
            !(
                phase === "DAY_DISCUSSION" ||
                phase === "DAY_VOTING" ||
                phase === "TIE_REVOTE" ||
                phase === "MASS_ELIMINATION_PROPOSAL" ||
                phase === "ELIMINATION_SPEECH" ||
                phase === "NIGHT_MAFIA_DISCUSSION" ||
                phase === "NIGHT_MAFIA_BOSS_GUESS" ||
                phase === "NIGHT_SHERIFF_ACTION"
            )
        )
            return;
        const g = gameMeta.value;
        if (!g || g.endedAt) return;

        const request = buildAiRequestForSeat(seatNumber);
        if (!request) return;
        const requestKey = buildPrefetchKey(request);

        // If we're already prefetching the exact same request, keep it.
        if (aiPrefetch.value?.seatNumber === seatNumber && aiPrefetch.value?.requestKey === requestKey) return;

        const startedAt = Date.now();
        const promise = requestAiAct(apiBase, request)
            .then((resp) => {
                if (aiPrefetch.value?.seatNumber === seatNumber && aiPrefetch.value?.requestKey === requestKey)
                    aiPrefetch.value = { ...aiPrefetch.value, response: resp };
                return resp;
            })
            .catch((e: any) => {
                const message = e?.message ?? String(e);
                if (aiPrefetch.value?.seatNumber === seatNumber && aiPrefetch.value?.requestKey === requestKey)
                    aiPrefetch.value = { ...aiPrefetch.value, error: message };
                throw e;
            });

        aiPrefetch.value = { seatNumber, requestKey, startedAt, promise, request };
    }

    function roleLogFor(roleId: RoleId, texts: ReturnType<typeof buildRoleLogTexts>) {
        if (roleId === "SHERIFF") return texts.sheriff;
        if (roleId === "MAFIA") return texts.mafia;
        if (roleId === "MAFIA_BOSS") return texts.boss;
        return texts.town;
    }

    async function requestAi() {
        gameError.value = "";
        if (ttsBusy.value) return null;
        if (aiBusy.value) return null;
        const g = gameMeta.value;
        if (!g) return null;
        if (g.endedAt) {
            gameError.value = "Game has ended";
            return null;
        }
        const phaseId = loopState.value.phaseId;
        if (phaseId === "NIGHT_MAFIA_KILL_SELECT") {
            const boss = bossSeatNumber.value ?? actingBossSeatNumber.value;
            const phaseToken = currentPhaseToken("NIGHT_MAFIA_DISCUSSION");
            const plan = bossNightPlan.value;
            if (!boss || !plan || plan.nightDiscussionPhaseToken !== phaseToken || plan.consumedKill) {
                gameError.value = "Missing boss kill plan for this night.";
                return null;
            }
            // Apply the boss's preloaded selection without an extra AI call.
            const select = plan.selectKillSeatNumber;
            if (typeof select === "number" && Number.isInteger(select) && nightKillOptions.value.some((x) => x.value === select)) {
                await appendEvent({
                    type: "PLAYER_SPEAK",
                    kind: "player",
                    payload: { seatNumber: boss, text: `I select kill target: #${select} ${seatLabel(select)}.` },
                });
                await appendEvent({
                    type: "NIGHT_KILL_SELECT",
                    kind: "player",
                    payload: { seatNumber: boss, targetSeatNumber: select },
                });
            }
            bossNightPlan.value = { ...plan, consumedKill: true };
            await onEndTurn();
            return { parsed: { ok: true }, requestId: "local", model: "local", roleLogCharCount: 0, promptCharCount: 0, openaiLatencyMs: 0, prompt: "", outputText: "" } as any;
        }
        const phaseToken = (() => {
            for (let i = gameEvents.value.length - 1; i >= 0; i--) {
                const ev = gameEvents.value[i];
                if (ev.type === "PHASE_CHANGED" && ev.payload?.to === phaseId) return String(ev.id);
            }
            return `start:${phaseId}`;
        })();
        const oneShotKey = `ai-once:${g.id}:${phaseToken}`;
        const isOneShotPhase = phaseId === "NIGHT_MAFIA_BOSS_GUESS" || phaseId === "NIGHT_SHERIFF_ACTION";
        if (
            !(
                phaseId === "DAY_DISCUSSION" ||
                phaseId === "DAY_VOTING" ||
                phaseId === "TIE_REVOTE" ||
                phaseId === "MASS_ELIMINATION_PROPOSAL" ||
                phaseId === "ELIMINATION_SPEECH" ||
                phaseId === "NIGHT_MAFIA_DISCUSSION" ||
                phaseId === "NIGHT_MAFIA_BOSS_GUESS" ||
                phaseId === "NIGHT_SHERIFF_ACTION"
            )
        ) {
            gameError.value =
                "AI is only wired for DAY_DISCUSSION, DAY_VOTING, TIE_REVOTE, MASS_ELIMINATION_PROPOSAL, ELIMINATION_SPEECH, NIGHT_MAFIA_DISCUSSION, NIGHT_MAFIA_BOSS_GUESS, and NIGHT_SHERIFF_ACTION right now.";
            return null;
        }
        if (isOneShotPhase && oneShotAiDoneKeys.has(oneShotKey)) return null;

        const seatNumber = loopState.value.currentSpeakerSeatNumber;

        if (phaseId === "NIGHT_MAFIA_BOSS_GUESS") {
            const boss = bossSeatNumber.value ?? actingBossSeatNumber.value;
            const nightToken = currentPhaseToken("NIGHT_MAFIA_DISCUSSION");
            const plan = bossNightPlan.value;
            if (
                boss &&
                seatNumber === boss &&
                plan &&
                plan.nightDiscussionPhaseToken === nightToken &&
                !plan.consumedGuess &&
                typeof plan.guessSheriffSeatNumber === "number" &&
                Number.isInteger(plan.guessSheriffSeatNumber) &&
                aliveSet.value.has(plan.guessSheriffSeatNumber) &&
                plan.guessSheriffSeatNumber !== boss
            ) {
                oneShotAiDoneKeys.add(oneShotKey);
                await appendEvent({
                    type: "PLAYER_SPEAK",
                    kind: "player",
                    payload: { seatNumber: boss, text: `I will check #${plan.guessSheriffSeatNumber} ${seatLabel(plan.guessSheriffSeatNumber)} for Sheriff.` },
                });
                bossNightPlan.value = { ...plan, consumedGuess: true };
                await onBossGuess(plan.guessSheriffSeatNumber);
                return { parsed: { ok: true }, requestId: "local", model: "local", roleLogCharCount: 0, promptCharCount: 0, openaiLatencyMs: 0, prompt: "", outputText: "" } as any;
            }
        }

        const request = buildAiRequestForSeat(seatNumber);
        if (!request) {
            gameError.value = `No player found for seat #${seatNumber}`;
            return null;
        }
        const requestKey = buildPrefetchKey(request);

        const logId = crypto.randomUUID();
        aiLogs.value = [...aiLogs.value, { id: logId, createdAt: new Date().toISOString(), request }];

        try {
            let resp: any;

            // If we already prefetched for this seat, use it (or await it).
            const pref = aiPrefetch.value;
            if (pref?.seatNumber === seatNumber && pref.requestKey === requestKey) {
                try {
                    resp = pref.response ?? (await pref.promise);
                } catch {
                    resp = undefined;
                } finally {
                    aiPrefetch.value = null;
                }
            }

            // Otherwise, make a normal request and show the spinner only for the network call.
            if (!resp) {
                try {
                    aiBusy.value = true;
                    resp = await requestAiAct(apiBase, request);
                } finally {
                    // Stop the avatar spinner as soon as the AI network call finishes.
                    // (TTS playback may continue afterwards and should not be treated as "AI loading".)
                    aiBusy.value = false;
                }
            }
            aiLogs.value = aiLogs.value.map((x) => (x.id === logId ? { ...x, response: resp } : x));

            if (!resp.parsed) {
                gameError.value = resp.parseError ?? "AI response could not be parsed.";
                return resp;
            }

            // Apply action-specific side effects.
            if (request.action === "DAY_DISCUSSION_SPEAK") {
                const say = (resp.parsed as any)?.say?.trim();
                if (say) {
                    await appendEvent({
                        type: "PLAYER_SPEAK",
                        kind: "player",
                        payload: { seatNumber, text: say },
                    });
                }

                const nominate = (resp.parsed as any)?.nominateSeatNumber;
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
            }

            if (request.action === "DAY_VOTING_VOTE" || request.action === "TIE_REVOTE_VOTE") {
                const phase = loopState.value.phaseId;
                if (!(phase === "DAY_VOTING" || phase === "TIE_REVOTE")) return resp;
                const candidates = phase === "DAY_VOTING" ? nominees.value : tieCandidates.value;

                const targetSeatNumber = Number((resp.parsed as any)?.targetSeatNumber);
                if (!Number.isInteger(targetSeatNumber) || !candidates.includes(targetSeatNumber)) {
                    gameError.value = resp.parseError ?? "AI vote missing/invalid.";
                    return resp;
                }

                await appendEvent({
                    type: "PLAYER_VOTE",
                    kind: "player",
                    payload: { voterSeatNumber: seatNumber, targetSeatNumber },
                });

                // When the last voter has voted, resolve the phase.
                const next = nextAliveSeatAfter(seatNumber);
                if (!next) {
                    await finalizeVotingPhase(phase);
                } else {
                    await onEndTurn();
                }
                return resp;
            }

            if (request.action === "MASS_ELIMINATION_PROPOSAL_VOTE") {
                const phase = loopState.value.phaseId;
                if (phase !== "MASS_ELIMINATION_PROPOSAL") return resp;
                const vote = (resp.parsed as any)?.vote === "YES" ? "YES" : (resp.parsed as any)?.vote === "NO" ? "NO" : null;
                if (!(vote === "YES" || vote === "NO")) {
                    gameError.value = resp.parseError ?? "AI vote missing/invalid.";
                    return resp;
                }

                await appendEvent({
                    type: "MASS_ELIMINATION_VOTE",
                    kind: "system",
                    payload: { voterSeatNumber: seatNumber, vote },
                });

                const next = nextAliveSeatAfter(seatNumber);
                if (!next) {
                    await finalizeMassEliminationProposal();
                } else {
                    await onEndTurn();
                }
                return resp;
            }

            if (request.action === "ELIMINATION_SPEECH_LAST_WORDS") {
                const say = (resp.parsed as any)?.say?.trim();
                if (say) {
                    await appendEvent({
                        type: "PLAYER_SPEAK",
                        kind: "player",
                        payload: { seatNumber, text: say },
                    });
                }
            }

            if (request.action === "NIGHT_MAFIA_DISCUSSION_SPEAK") {
                const say = (resp.parsed as any)?.say?.trim();
                if (say) {
                    await appendEvent({
                        type: "PLAYER_SPEAK",
                        kind: "player",
                        payload: { seatNumber, text: say },
                    });
                }

                const suggest = (resp.parsed as any)?.suggestKillSeatNumber;
                if (
                    typeof suggest === "number" &&
                    Number.isInteger(suggest) &&
                    nightKillOptions.value.some((x) => x.value === suggest)
                ) {
                    // Record suggestion for mafia context/logs.
                    await appendEvent({
                        type: "NIGHT_KILL_SUGGEST",
                        kind: "player",
                        payload: { seatNumber, targetSeatNumber: suggest },
                    });
                }
            }

            if (request.action === "NIGHT_MAFIA_BOSS_DISCUSSION_SELECT_KILL_GUESS_SHERIFF") {
                const say = (resp.parsed as any)?.say?.trim();
                if (say) {
                    await appendEvent({
                        type: "PLAYER_SPEAK",
                        kind: "player",
                        payload: { seatNumber, text: say },
                    });
                }

                // Store the boss plan for later phases (kill select + boss guess),
                // so we keep the game phases but avoid extra AI calls.
                const selectRaw = (resp.parsed as any)?.selectKillSeatNumber;
                const select =
                    typeof selectRaw === "number" && Number.isInteger(selectRaw) ? (selectRaw as number) : null;
                const guessRaw = (resp.parsed as any)?.guessSheriffSeatNumber;
                const guess =
                    typeof guessRaw === "number" && Number.isInteger(guessRaw) ? (guessRaw as number) : null;

                const nightToken = currentPhaseToken("NIGHT_MAFIA_DISCUSSION");
                bossNightPlan.value = {
                    nightDiscussionPhaseToken: nightToken,
                    bossSeatNumber: seatNumber,
                    selectKillSeatNumber: select,
                    guessSheriffSeatNumber: guess,
                    consumedKill: false,
                    consumedGuess: false,
                };
            }

            if (request.action === "NIGHT_MAFIA_BOSS_GUESS_SHERIFF") {
                const guess = (resp.parsed as any)?.guessSheriffSeatNumber;
                if (
                    typeof guess === "number" &&
                    Number.isInteger(guess) &&
                    aliveSet.value.has(guess) &&
                    guess !== seatNumber
                ) {
                    // Mark immediately so auto-mode cannot re-trigger while the phase-advance coroutine is still running.
                    oneShotAiDoneKeys.add(oneShotKey);
                    // Voiced line from the boss, then perform the actual boss check.
                    await appendEvent({
                        type: "PLAYER_SPEAK",
                        kind: "player",
                        payload: { seatNumber, text: `I will check #${guess} ${seatLabel(guess)} for Sheriff.` },
                    });
                    await onBossGuess(guess);
                } else {
                    gameError.value = "Boss guess must be an alive seat number and not yourself.";
                }
            }

            if (request.action === "NIGHT_SHERIFF_INVESTIGATE") {
                const target = (resp.parsed as any)?.investigateSeatNumber;
                if (
                    typeof target === "number" &&
                    Number.isInteger(target) &&
                    aliveSet.value.has(target) &&
                    target !== seatNumber
                ) {
                    // Mark immediately so auto-mode cannot re-trigger while the night-resolution coroutine is still running.
                    oneShotAiDoneKeys.add(oneShotKey);
                    // Voiced line from the sheriff, then perform the investigation (host reveals result and advances to morning).
                    await appendEvent({
                        type: "PLAYER_SPEAK",
                        kind: "player",
                        payload: { seatNumber, text: `I investigate #${target} ${seatLabel(target)} tonight.` },
                    });
                    await onSheriffInvestigate(target);
                } else {
                    gameError.value = "Sheriff investigation target must be an alive seat number and not yourself.";
                }
            }

            // After the AI has acted, advance the game appropriately.
            // - Most phases: end the turn as usual.
            // - Boss guess: we call onBossGuess() which already advances the phase; do NOT also end turn.
            if (
                request.action !== "NIGHT_MAFIA_BOSS_GUESS_SHERIFF" &&
                request.action !== "NIGHT_SHERIFF_INVESTIGATE"
            ) {
                await onEndTurn();
            }

            return resp;
        } catch (err: any) {
            const message = err?.message ?? String(err);
            aiLogs.value = aiLogs.value.map((x) => (x.id === logId ? { ...x, error: message } : x));
            gameError.value = message;
            return null;
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
            // Non-blocking bubbles (votes, etc.)
            showBubbleForEvent(created);
            // Blocking TTS bubbles (host + player speech)
            await maybeSpeakForEvent(created);
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
            // Don't block the SSE handler; just queue audio playback.
            void maybeSpeakForEvent(incoming);
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

    function showBubbleHold(key: string, text: string) {
        const until = Number.MAX_SAFE_INTEGER;
        const next = new Map(bubbleBySeat.value);
        next.set(key, { text, until });
        bubbleBySeat.value = next;
    }

    function clearBubble(key: string) {
        if (!bubbleBySeat.value.has(key)) return;
        const next = new Map(bubbleBySeat.value);
        next.delete(key);
        bubbleBySeat.value = next;
    }

    function hostPreset() {
        const id = gameMeta.value?.host?.id;
        return id ? PLAYERS_PRESET.find((p) => p.id === id) : undefined;
    }

    function seatPreset(seatNumber: number) {
        const p = playerBySeat(seatNumber);
        return p ? PLAYERS_PRESET.find((x) => x.id === p.id) : undefined;
    }

    function defaultTts(): TtsParams {
        return { languageCode: "en-US", voiceName: "en-US-Standard-C", speakingRate: 1.0, pitch: 0.0 };
    }

    function ttsForKey(key: string): TtsParams {
        if (key === "host") return hostPreset()?.tts ?? defaultTts();
        const m = /^p(\d+)$/.exec(key);
        const seat = m ? Number(m[1]) : NaN;
        if (!Number.isFinite(seat)) return defaultTts();
        return seatPreset(seat)?.tts ?? defaultTts();
    }

    function enqueueSpeech(key: string, text: string): Promise<void> {
        return new Promise<void>((resolve) => {
            speechQueue.push({ key, text, tts: ttsForKey(key), resolve });
            void pumpSpeechQueue();
        });
    }

    function skipTts() {
        if (!currentSpeech) return;
        try {
            currentSpeech.controller.abort();
        } catch {
            // ignore
        }
        try {
            if (currentSpeech.audio) {
                currentSpeech.audio.pause();
                currentSpeech.audio.currentTime = 0;
            }
        } catch {
            // ignore
        }
        try {
            if (currentSpeech.url) URL.revokeObjectURL(currentSpeech.url);
        } catch {
            // ignore
        }
        currentSpeech.finish();
    }

    async function pumpSpeechQueue() {
        if (speechRunning) return;
        const item = speechQueue.shift();
        if (!item) return;

        speechRunning = true;
        ttsBusy.value = true;
        ttsNowKey.value = item.key;

        showBubbleHold(item.key, item.text);

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            clearBubble(item.key);
            ttsNowKey.value = null;
            ttsBusy.value = false;
            currentSpeech = null;
            speechRunning = false;
            item.resolve();
            void pumpSpeechQueue();
        };

        const controller = new AbortController();
        currentSpeech = { key: item.key, controller, audio: null, url: null, finish };

        try {
            // Prefetch the next speaker's AI while the current speaker's audio plays.
            // We already have the current speech appended to the logs, so this is safe and makes autoplay seamless.
            if (autoMode.value) {
                const phase = loopState.value.phaseId;
                const currentSeat = loopState.value.currentSpeakerSeatNumber;

                // While the host is speaking, preload the AI response for whoever is about to act next.
                if (item.key === "host") {
                    startPrefetchForSeat(currentSeat);
                }

                // While a player is speaking, preload the next player's AI (phase-specific).
                if (item.key === `p${currentSeat}`) {
                    if (phase === "DAY_DISCUSSION") {
                        const nextSeat = nextAliveSeatAfter(currentSeat);
                        if (nextSeat != null) startPrefetchForSeat(nextSeat);
                    } else if (phase === "NIGHT_MAFIA_DISCUSSION") {
                        const mafia = bossLastOrder(mafiaSeatNumbers.value);
                        const i = mafia.indexOf(currentSeat);
                        const nextSeat = i >= 0 ? mafia[i + 1] : null;
                        if (nextSeat != null) startPrefetchForSeat(nextSeat);
                    } else if (phase === "ELIMINATION_SPEECH") {
                        const q = eliminationQueue.value;
                        const i = q.indexOf(currentSeat);
                        const nextSeat = i >= 0 ? q[i + 1] : null;
                        if (nextSeat != null) startPrefetchForSeat(nextSeat);
                    }
                }
            }

            const res = await fetch(`${apiBase}/tts/speak`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    text: item.text,
                    languageCode: item.tts.languageCode,
                    voiceName: item.tts.voiceName,
                    speakingRate: item.tts.speakingRate,
                    pitch: item.tts.pitch,
                }),
                signal: controller.signal,
            });
            if (!res.ok) {
                const msg = await res.text().catch(() => "");
                throw new Error(msg || `HTTP ${res.status}`);
            }
            const buf = await res.arrayBuffer();

            const blob = new Blob([buf], { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);
            currentSpeech.url = url;

            const audio = new Audio(url);
            currentSpeech.audio = audio;

            audio.onended = () => {
                try {
                    URL.revokeObjectURL(url);
                } catch {
                    // ignore
                }
                finish();
            };
            audio.onerror = () => {
                try {
                    URL.revokeObjectURL(url);
                } catch {
                    // ignore
                }
                finish();
            };

            await audio.play();
        } catch (e: any) {
            if (e?.name === "AbortError") {
                finish();
                return;
            }
            // Fall back to timed bubble (never deadlock gameplay on TTS issues).
            const ms = Math.max(900, Math.min(6000, 800 + item.text.length * 12));
            window.setTimeout(() => finish(), ms);
        }
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

    async function maybeSpeakForEvent(ev: ApiGameEvent): Promise<void> {
        if (!ev) return;

        if (ev.type === "HOST_MESSAGE") {
            const text = String(ev.payload?.text ?? "").trim();
            if (!text) return;
            const existing = speechPromiseByEventId.get(ev.id);
            if (existing) {
                await existing;
                return;
            }
            const p = enqueueSpeech("host", text);
            speechPromiseByEventId.set(ev.id, p);
            try {
                await p;
            } finally {
                speechPromiseByEventId.delete(ev.id);
            }
            return;
        }

        if (ev.type === "PLAYER_SPEAK") {
            const seat = Number(ev.payload?.seatNumber);
            const text = String(ev.payload?.text ?? "").trim();
            if (!Number.isFinite(seat) || !text) return;
            const existing = speechPromiseByEventId.get(ev.id);
            if (existing) {
                await existing;
                return;
            }
            const p = enqueueSpeech(`p${seat}`, text);
            speechPromiseByEventId.set(ev.id, p);
            try {
                await p;
            } finally {
                speechPromiseByEventId.delete(ev.id);
            }
            return;
        }
    }

    function showBubbleForEvent(ev: ApiGameEvent) {
        // Speech bubbles are handled by TTS pipeline (host + player speak).
        if (ev.type === "HOST_MESSAGE" || ev.type === "PLAYER_SPEAK") return;

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

    async function onSpeak() {
        if (ttsBusy.value) return;
        const text = speakDraft.value.trim();
        if (!text) return;
        await appendEvent({
            type: "PLAYER_SPEAK",
            kind: "player",
            payload: { seatNumber: loopState.value.currentSpeakerSeatNumber, text },
        });
        speakDraft.value = "";
    }

    async function onNominate() {
        if (ttsBusy.value) return;
        const n = Number.parseInt(nominateDraft.value, 10);
        if (!Number.isInteger(n)) return;
        await appendEvent({
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
        if (ttsBusy.value) return;
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
        if (!(phase === "DAY_VOTING" || phase === "TIE_REVOTE")) return;
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
        await finalizeVotingPhase(phase);
    }

    async function finalizeVotingPhase(phase: "DAY_VOTING" | "TIE_REVOTE") {
        const candidates = phase === "DAY_VOTING" ? nominees.value : tieCandidates.value;
        const votes = votesInCurrentPhase();
        const counts = new Map<number, number>();
        for (const c of candidates) counts.set(c, 0);
        for (const target of votes.values()) {
            if (counts.has(target)) counts.set(target, (counts.get(target) ?? 0) + 1);
        }

        const tallyLines = candidates.map((c) => `${seatLabel(c)}: ${counts.get(c) ?? 0}`).join(", ");
        await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: `Vote tally: ${tallyLines}.` } });

        // Keep the vote badges visible for a moment for viewers.
        await new Promise<void>((r) => window.setTimeout(r, 1400));

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
    }

    async function finalizeMassEliminationProposal() {
        const alive = aliveSeatNumbers.value;
        const votes = massVotesInCurrentPhase();
        let yes = 0;
        for (const v of votes.values()) if (v === "YES") yes++;
        const no = alive.length - yes;

        await appendEvent({
            type: "HOST_MESSAGE",
            kind: "host",
            payload: { text: `Mass elimination votes: YES ${yes}, NO ${no}.` },
        });

        // Keep the vote badges visible for a moment for viewers.
        await new Promise<void>((r) => window.setTimeout(r, 1400));

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
            const first = candidates[0];
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "MASS_ELIMINATION_PROPOSAL", to: "ELIMINATION_SPEECH", eliminated: candidates },
            });
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
        await appendEvent({
            type: "NIGHT_STARTED",
            kind: "system",
            payload: { dayNumber: loopState.value.dayNumber },
        });
        const mafia = bossLastOrder(mafiaSeatNumbers.value);
        await appendEvent({
            type: "PHASE_CHANGED",
            kind: "system",
            payload: { from: "MASS_ELIMINATION_PROPOSAL", to: "NIGHT_MAFIA_DISCUSSION", speakers: mafia },
        });
        await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "The town goes to sleep. Night begins." } });
        await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "Mafia are awake." } });
        await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "Mafia need to decide who to kill." } });
    }

    async function onProposalVote() {
        if (ttsBusy.value) return;
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
        await appendEvent({
            type: "NIGHT_STARTED",
            kind: "system",
            payload: { dayNumber: loopState.value.dayNumber },
        });
        const mafia = bossLastOrder(mafiaSeatNumbers.value);
        await appendEvent({
            type: "PHASE_CHANGED",
            kind: "system",
            payload: { from: "MASS_ELIMINATION_PROPOSAL", to: "NIGHT_MAFIA_DISCUSSION", speakers: mafia },
        });
        await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "The town goes to sleep. Night begins." } });
        await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "Mafia are awake." } });
        await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "Mafia need to decide who to kill." } });
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

        // Ensure everyone is visually asleep right before morning reveal.
        if (nightPhase !== "NIGHT_SLEEP") {
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: nightPhase, to: "NIGHT_SLEEP" },
            });
        }

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
            payload: { from: "NIGHT_SLEEP", to: "MORNING_REVEAL" },
        });
        await appendEvent({ type: "NIGHT_ENDED", kind: "system", payload: { dayNumber: loopState.value.dayNumber } });
        await sleep(750);

        // 3) Announce outcome, then transition to next phase.
        if (kill != null && aliveSet.value.has(kill)) {
            await appendEvent({
                type: "NIGHT_RESULT",
                kind: "system",
                payload: { killedSeatNumber: kill },
            });
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

        await appendEvent({
            type: "NIGHT_RESULT",
            kind: "system",
            payload: { killedSeatNumber: null },
        });
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
        await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "Boss goes back to sleep." } });

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
            payload: { text: "Sheriff is awake. Choose someone to investigate." },
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
        await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "Sheriff goes back to sleep." } });
        await appendEvent({ type: "PHASE_CHANGED", kind: "system", payload: { from: "NIGHT_SHERIFF_ACTION", to: "NIGHT_SLEEP" } });
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
        if (to === "NIGHT_MAFIA_KILL_SELECT")
            return { from, to, speakers: actingBossSeatNumber.value != null ? [actingBossSeatNumber.value] : [] };
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
        if (ttsBusy.value) return;
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
                await appendEvent({
                    type: "NIGHT_STARTED",
                    kind: "system",
                    payload: { dayNumber: loopState.value.dayNumber },
                });
                const mafia = bossLastOrder(mafiaSeatNumbers.value);
                await appendEvent({
                    type: "PHASE_CHANGED",
                    kind: "system",
                    payload: { from: "DAY_DISCUSSION", to: "NIGHT_MAFIA_DISCUSSION", speakers: mafia },
                });
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { text: "The town goes to sleep. Night begins." },
                });
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { text: "Mafia are awake." },
                });
                await appendEvent({
                    type: "HOST_MESSAGE",
                    kind: "host",
                    payload: { text: "Mafia need to decide who to kill." },
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

            const mafia = bossLastOrder(mafiaSeatNumbers.value);
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "WIN_CHECK", to: "NIGHT_MAFIA_DISCUSSION", speakers: mafia },
            });
            await appendEvent({
                type: "NIGHT_STARTED",
                kind: "system",
                payload: { dayNumber: loopState.value.dayNumber },
            });
            await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "The town goes to sleep. Night begins." } });
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: "Mafia are awake." },
            });
            await appendEvent({ type: "HOST_MESSAGE", kind: "host", payload: { text: "Mafia need to decide who to kill." } });
            return;
        }

        if (phase === "NIGHT_MAFIA_DISCUSSION") {
            const mafia = bossLastOrder(mafiaSeatNumbers.value);
            const boss = bossSeatNumber.value;
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

            // Proceed to explicit kill-select phase (boss only), then boss-check phase, then sheriff.
            const actingBoss = actingBossSeatNumber.value;
            if (actingBoss == null) {
                await resolveNightAndStartDay();
                return;
            }
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "NIGHT_MAFIA_DISCUSSION", to: "NIGHT_MAFIA_KILL_SELECT", speakers: [actingBoss] },
            });
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: "Kill selection phase. Boss is awake." },
            });
            return;
        }

        if (phase === "NIGHT_MAFIA_KILL_SELECT") {
            const boss = actingBossSeatNumber.value;
            if (boss == null) {
                await resolveNightAndStartDay();
                return;
            }
            await appendEvent({
                type: "PHASE_CHANGED",
                kind: "system",
                payload: { from: "NIGHT_MAFIA_KILL_SELECT", to: "NIGHT_MAFIA_BOSS_GUESS", speakers: [boss] },
            });
            await appendEvent({
                type: "HOST_MESSAGE",
                kind: "host",
                payload: { text: "Boss is awake. Choose someone to check for Sheriff." },
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
            payload: { text: "Sheriff is awake. Choose someone to investigate." },
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

        // Autoplay: when enabled, advance the game automatically by calling AI for the current speaker.
        // Supported phases (AI-wired): DAY_DISCUSSION, DAY_VOTING, TIE_REVOTE, MASS_ELIMINATION_PROPOSAL, ELIMINATION_SPEECH, NIGHT_MAFIA_DISCUSSION, NIGHT_MAFIA_KILL_SELECT, NIGHT_MAFIA_BOSS_GUESS, NIGHT_SHERIFF_ACTION.
    let autoTimer: number | null = null;
    onMounted(() => {
        watch(
            [
                autoMode,
                () => loopState.value.phaseId,
                () => loopState.value.currentSpeakerSeatNumber,
                () => Boolean(gameMeta.value?.endedAt),
                ttsBusy,
                aiBusy,
            ],
            () => {
                if (autoTimer != null) {
                    window.clearTimeout(autoTimer);
                    autoTimer = null;
                }
                if (!autoMode.value) return;
                if (!gameMeta.value || gameMeta.value.endedAt) return;
                if (
                    !(
                        loopState.value.phaseId === "DAY_DISCUSSION" ||
                        loopState.value.phaseId === "DAY_VOTING" ||
                        loopState.value.phaseId === "TIE_REVOTE" ||
                        loopState.value.phaseId === "MASS_ELIMINATION_PROPOSAL" ||
                        loopState.value.phaseId === "ELIMINATION_SPEECH" ||
                        loopState.value.phaseId === "NIGHT_MAFIA_DISCUSSION" ||
                        loopState.value.phaseId === "NIGHT_MAFIA_KILL_SELECT" ||
                        loopState.value.phaseId === "NIGHT_MAFIA_BOSS_GUESS" ||
                        loopState.value.phaseId === "NIGHT_SHERIFF_ACTION"
                    )
                )
                    return;
                if (ttsBusy.value) return;
                if (aiBusy.value) return;

                // Small pacing delay between turns for readability.
                autoTimer = window.setTimeout(() => {
                    autoTimer = null;
                    if (!autoMode.value) return;
                    if (ttsBusy.value || aiBusy.value) return;
                    void requestAi();
                }, 450);
            },
            { immediate: true }
        );
    });
    onBeforeUnmount(() => {
        if (autoTimer != null) window.clearTimeout(autoTimer);
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
        ttsBusy,
        ttsNowKey,
        autoMode,
        aiPrefetchSeatNumber,
        aiPrefetchBusy,
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
        skipTts,
    };
}
