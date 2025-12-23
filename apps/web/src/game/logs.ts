import type { ApiGameEvent, ApiGameMeta, LocalPhaseId } from "./types";
import { aliveSeatsFromEvents, rebuildLoopStateFromEvents } from "./logic";

type RoleLogId = "TOWN" | "SHERIFF" | "MAFIA" | "MAFIA_BOSS";

function seatName(meta: ApiGameMeta | null, seatNumber: number) {
    const p = meta?.players?.find((x) => x.seatNumber === seatNumber);
    return p?.name ?? `Seat #${seatNumber}`;
}

function seatRef(meta: ApiGameMeta | null, seatNumber: number) {
    return `#${seatNumber} ${seatName(meta, seatNumber)}`;
}

function phaseChangedLine(meta: ApiGameMeta | null, from: LocalPhaseId, to: LocalPhaseId, payload: any): string | null {
    switch (to) {
        case "DAY_DISCUSSION":
            return "Day discussion starts.";
        case "DAY_VOTING":
            return "Voting starts.";
        case "TIE_DISCUSSION":
            return "Tie discussion starts.";
        case "TIE_REVOTE":
            return "Tie revote starts.";
        case "MASS_ELIMINATION_PROPOSAL":
            return "Mass elimination proposal vote starts.";
        case "ELIMINATION_SPEECH": {
            const eliminated = Array.isArray(payload?.eliminated)
                ? payload.eliminated.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n))
                : [];
            if (eliminated.length) return `Final words: ${eliminated.map((s: number) => seatRef(meta, s)).join(", ")}.`;
            return "Final words phase starts.";
        }
        case "NIGHT_MAFIA_DISCUSSION":
            return "Night falls. Mafia discuss.";
        case "NIGHT_MAFIA_BOSS_GUESS":
            return "Night: mafia boss check starts.";
        case "NIGHT_SHERIFF_ACTION":
            return "Night: sheriff investigation starts.";
        case "MORNING_REVEAL":
            return "Morning reveal.";
        case "WIN_CHECK":
            return "Checking win conditions.";
        case "GAME_END":
            return "Game ended.";
        default: {
            // Keep a tiny fallback for phases we haven't mapped.
            if (from && to) return `Phase: ${from} → ${to}.`;
            return null;
        }
    }
}

function formatEvent(meta: ApiGameMeta | null, ev: ApiGameEvent): string | null {
    switch (ev.type) {
        case "HOST_MESSAGE":
            return null;
        case "PLAYER_SPEAK": {
            const seat = Number(ev.payload?.seatNumber);
            const text = String(ev.payload?.text ?? "");
            if (!Number.isFinite(seat)) return null;
            return `${seatRef(meta, seat)}: ${text}`.trim();
        }
        case "PLAYER_NOMINATE": {
            const actor = Number(ev.payload?.seatNumber);
            const target = Number(ev.payload?.targetSeatNumber);
            if (!Number.isFinite(actor) || !Number.isFinite(target)) return null;
            return `${seatRef(meta, actor)} nominated ${seatRef(meta, target)}.`;
        }
        case "PLAYER_VOTE": {
            const voter = Number(ev.payload?.voterSeatNumber);
            const target = Number(ev.payload?.targetSeatNumber);
            if (!Number.isFinite(voter) || !Number.isFinite(target)) return null;
            return `${seatRef(meta, voter)} voted for ${seatRef(meta, target)}.`;
        }
        case "MASS_ELIMINATION_VOTE": {
            const voter = Number(ev.payload?.voterSeatNumber);
            if (!Number.isFinite(voter)) return null;
            const vote = ev.payload?.vote === "YES" ? "YES" : "NO";
            return `${seatRef(meta, voter)} voted ${vote} for mass elimination.`;
        }
        case "PLAYER_ELIMINATED": {
            const who = Number(ev.payload?.seatNumber);
            if (!Number.isFinite(who)) return null;
            const reason = String(ev.payload?.reason ?? "UNKNOWN");
            return `${seatRef(meta, who)} was eliminated (reason: ${reason}).`;
        }
        case "NIGHT_KILL_SUGGEST": {
            const actor = Number(ev.payload?.seatNumber);
            const target = Number(ev.payload?.targetSeatNumber);
            if (!Number.isFinite(actor) || !Number.isFinite(target)) return null;
            return `${seatRef(meta, actor)} suggested killing ${seatRef(meta, target)}.`;
        }
        case "NIGHT_KILL_SELECT": {
            const actor = Number(ev.payload?.seatNumber);
            const target = Number(ev.payload?.targetSeatNumber);
            if (!Number.isFinite(actor) || !Number.isFinite(target)) return null;
            return `${seatRef(meta, actor)} selected kill target: ${seatRef(meta, target)}.`;
        }
        case "NIGHT_BOSS_GUESS": {
            const actor = Number(ev.payload?.seatNumber);
            const target = Number(ev.payload?.targetSeatNumber);
            const isSheriff = Boolean(ev.payload?.isSheriff);
            if (!Number.isFinite(actor) || !Number.isFinite(target)) return null;
            return `${seatRef(meta, actor)} (boss) checked ${seatRef(meta, target)} → ${
                isSheriff ? "Sheriff" : "Not Sheriff"
            }.`;
        }
        case "NIGHT_SHERIFF_INVESTIGATE": {
            const actor = Number(ev.payload?.seatNumber);
            const target = Number(ev.payload?.targetSeatNumber);
            const isMafia = Boolean(ev.payload?.isMafia);
            if (!Number.isFinite(actor) || !Number.isFinite(target)) return null;
            return `${seatRef(meta, actor)} (sheriff) investigated ${seatRef(meta, target)} → ${
                isMafia ? "Mafia" : "Town"
            }.`;
        }
        case "PHASE_CHANGED": {
            const from = ev.payload?.from as LocalPhaseId | undefined;
            const to = ev.payload?.to as LocalPhaseId | undefined;
            if (!from || !to) return null;
            return phaseChangedLine(meta, from, to, ev.payload);
        }
        case "WIN_RESULT":
            return `WINNER: ${String(ev.payload?.winner ?? "")}`.trim();
        case "GAME_ENDED":
            return `GAME ENDED.`;
        default:
            return null;
    }
}

const DAY_PHASES = new Set<LocalPhaseId>([
    "DAY_DISCUSSION",
    "DAY_VOTING",
    "TIE_DISCUSSION",
    "TIE_REVOTE",
    "MASS_ELIMINATION_PROPOSAL",
    "ELIMINATION_SPEECH",
    "MORNING_REVEAL",
    "WIN_CHECK",
    "GAME_END",
]);

function shouldIncludeForRole(args: {
    role: RoleLogId;
    phaseAtEvent: LocalPhaseId;
    ev: ApiGameEvent;
}): boolean {
    const { role, phaseAtEvent, ev } = args;
    const isDay = DAY_PHASES.has(phaseAtEvent);

    // Secret event types (night actions).
    const isNightMafiaAction = ev.type === "NIGHT_KILL_SUGGEST" || ev.type === "NIGHT_KILL_SELECT";
    const isBossCheck = ev.type === "NIGHT_BOSS_GUESS";
    const isSheriffCheck = ev.type === "NIGHT_SHERIFF_INVESTIGATE";

    // Avoid duplicating boss/sheriff results: host currently emits result messages too.
    const isHostNightResultLeak =
        ev.type === "HOST_MESSAGE" && (phaseAtEvent === "NIGHT_MAFIA_BOSS_GUESS" || phaseAtEvent === "NIGHT_SHERIFF_ACTION");

    const isTownVisible = isDay && !isHostNightResultLeak && !isNightMafiaAction && !isBossCheck && !isSheriffCheck;

    if (role === "TOWN") return isTownVisible;
    if (role === "SHERIFF") return isTownVisible || isSheriffCheck;
    if (role === "MAFIA") return isTownVisible || isNightMafiaAction || (ev.type === "HOST_MESSAGE" && phaseAtEvent === "NIGHT_MAFIA_DISCUSSION");
    // MAFIA_BOSS
    return (
        isTownVisible ||
        isNightMafiaAction ||
        isBossCheck ||
        (ev.type === "HOST_MESSAGE" && (phaseAtEvent === "NIGHT_MAFIA_DISCUSSION" || phaseAtEvent === "NIGHT_MAFIA_BOSS_GUESS"))
    );
}

export function buildRoleLogTexts(args: { meta: ApiGameMeta | null; events: ApiGameEvent[] }) {
    const { meta, events } = args;

    if (!meta) {
        const empty = "No active game yet.";
        return { town: empty, sheriff: empty, mafia: empty, boss: empty };
    }

    const loop = rebuildLoopStateFromEvents(events);
    const aliveNow = Array.from(aliveSeatsFromEvents(events)).sort((a, b) => a - b);

    const headerBase = [
        `Game: ${meta.id}`,
        `Day: ${loop.dayNumber}`,
        `Current phase: ${loop.phaseId}`,
        `Alive (${aliveNow.length}): ${aliveNow.map((s) => seatRef(meta, s)).join(", ")}`,
        "",
    ];

    const linesByRole: Record<RoleLogId, string[]> = {
        TOWN: [...headerBase],
        SHERIFF: [...headerBase],
        MAFIA: [...headerBase],
        MAFIA_BOSS: [...headerBase],
    };

    let phase: LocalPhaseId = "DAY_DISCUSSION";

    for (const ev of events) {
        let phaseAtEvent: LocalPhaseId = phase;
        if (ev.type === "PHASE_CHANGED") {
            const to = ev.payload?.to as LocalPhaseId | undefined;
            if (to) {
                phase = to;
                phaseAtEvent = to;
            }
        }

        const line = formatEvent(meta, ev);
        if (!line) continue;

        for (const role of Object.keys(linesByRole) as RoleLogId[]) {
            if (!shouldIncludeForRole({ role, phaseAtEvent, ev })) continue;
            linesByRole[role].push(line);
        }
    }

    return {
        town: linesByRole.TOWN.join("\n"),
        sheriff: linesByRole.SHERIFF.join("\n"),
        mafia: linesByRole.MAFIA.join("\n"),
        boss: linesByRole.MAFIA_BOSS.join("\n"),
    };
}


