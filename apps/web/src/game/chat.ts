import type { ChatMessage } from "@/types/chat";
import type { ApiGameEvent, ApiGameMeta, LocalPhaseId } from "./types";

function fmtTime(iso: string) {
    return iso.slice(11, 16);
}

export type SeatLabelResolver = (seatNumber: number) => string;

export function buildLobbyChatMessages(seatLines: string[]): ChatMessage[] {
    return [
        {
            id: "sys-0",
            kind: "system",
            sender: "SYSTEM",
            time: "00:00",
            text: "Random seats selected. Please have a seat.",
        },
        { id: "sys-1", kind: "system", sender: "SYSTEM", time: "00:01", text: seatLines.join("\n") },
    ];
}

export function buildChatMessages(args: {
    meta: ApiGameMeta | null;
    events: ApiGameEvent[];
    seatLabel: SeatLabelResolver;
    lobbySeatLines: string[];
}): ChatMessage[] {
    const { meta, events, seatLabel, lobbySeatLines } = args;
    if (!meta) return buildLobbyChatMessages(lobbySeatLines);

    // Track phase while rendering to allow phase-aware formatting (e.g., hide TURN_ENDED during voting).
    let phase: LocalPhaseId = "DAY_DISCUSSION";

    const mapped = events.map((ev) => {
        if (ev.type === "PHASE_CHANGED") {
            const to = ev.payload?.to as LocalPhaseId | undefined;
            if (to) phase = to;
        }

        if (ev.type === "HOST_MESSAGE") {
            return { id: ev.id, kind: "host", sender: "HOST", time: fmtTime(ev.createdAt), text: ev.payload.text };
        }

        if (ev.type === "PLAYER_SPEAK") {
            const sender = seatLabel(Number(ev.payload?.seatNumber));
            return { id: ev.id, kind: "player", sender, time: fmtTime(ev.createdAt), text: ev.payload.text };
        }

        if (ev.type === "PLAYER_NOMINATE") {
            const actor = seatLabel(Number(ev.payload?.seatNumber));
            const target = seatLabel(Number(ev.payload?.targetSeatNumber));
            const text = `${actor} nominated ${target} for voting.`;
            return { id: ev.id, kind: "system", sender: "SYSTEM", time: fmtTime(ev.createdAt), text };
        }

        if (ev.type === "PLAYER_VOTE") {
            const voter = seatLabel(Number(ev.payload?.voterSeatNumber));
            const target = seatLabel(Number(ev.payload?.targetSeatNumber));
            const text = `${voter} voted for ${target}.`;
            return { id: ev.id, kind: "system", sender: "SYSTEM", time: fmtTime(ev.createdAt), text };
        }

    if (ev.type === 'NIGHT_KILL_SUGGEST') {
      const actor = seatLabel(Number(ev.payload?.seatNumber));
      const target = seatLabel(Number(ev.payload?.targetSeatNumber));
      const text = `${actor} suggested killing ${target}.`;
      return { id: ev.id, kind: 'system', sender: 'SYSTEM', time: fmtTime(ev.createdAt), text };
    }

    if (ev.type === 'NIGHT_KILL_SELECT') {
      const actor = seatLabel(Number(ev.payload?.seatNumber));
      const target = seatLabel(Number(ev.payload?.targetSeatNumber));
      const text = `${actor} selected ${target} as the kill target.`;
      return { id: ev.id, kind: 'system', sender: 'SYSTEM', time: fmtTime(ev.createdAt), text };
    }

    if (ev.type === 'NIGHT_BOSS_GUESS') {
      const actor = seatLabel(Number(ev.payload?.seatNumber));
      const target = seatLabel(Number(ev.payload?.targetSeatNumber));
      const isSheriff = Boolean(ev.payload?.isSheriff);
      const text = `${actor} guessed ${target}. Host ответ: ${isSheriff ? 'Sheriff' : 'Not Sheriff'}.`;
      return { id: ev.id, kind: 'system', sender: 'SYSTEM', time: fmtTime(ev.createdAt), text };
    }

    if (ev.type === 'NIGHT_SHERIFF_INVESTIGATE') {
      const actor = seatLabel(Number(ev.payload?.seatNumber));
      const target = seatLabel(Number(ev.payload?.targetSeatNumber));
      const isMafia = Boolean(ev.payload?.isMafia);
      const text = `${actor} investigated ${target}. Host ответ: ${isMafia ? 'Mafia' : 'Town'}.`;
      return { id: ev.id, kind: 'system', sender: 'SYSTEM', time: fmtTime(ev.createdAt), text };
    }

        if (ev.type === "MASS_ELIMINATION_VOTE") {
            const voter = seatLabel(Number(ev.payload?.voterSeatNumber));
            const vote = ev.payload?.vote === "YES" ? "YES" : "NO";
            const text = `${voter} voted ${vote} for mass elimination.`;
            return { id: ev.id, kind: "system", sender: "SYSTEM", time: fmtTime(ev.createdAt), text };
        }

        if (ev.type === "PLAYER_ELIMINATED") {
            const who = seatLabel(Number(ev.payload?.seatNumber));
            const text = `${who} was eliminated.`;
            return { id: ev.id, kind: "system", sender: "SYSTEM", time: fmtTime(ev.createdAt), text };
        }

        if (ev.type === "PHASE_CHANGED") {
            return {
                id: ev.id,
                kind: "system",
                sender: "SYSTEM",
                time: fmtTime(ev.createdAt),
                text: `Phase changed: ${ev.payload.from} → ${ev.payload.to}`,
            };
        }

        if (ev.type === "TURN_ENDED") {
            // During voting/proposal phases, we don't want per-player "ended turn" spam in the chat.
            if (phase === "DAY_VOTING" || phase === "TIE_REVOTE" || phase === "MASS_ELIMINATION_PROPOSAL") return null;
            const who = seatLabel(Number(ev.payload?.seatNumber));
            return {
                id: ev.id,
                kind: "system",
                sender: "SYSTEM",
                time: fmtTime(ev.createdAt),
                text: `${who} ended their turn.`,
            };
        }

        if (ev.type === "GAME_ENDED") {
            return { id: ev.id, kind: "system", sender: "SYSTEM", time: fmtTime(ev.createdAt), text: "Game ended." };
        }

        // GAME_CREATED / unknown
        return {
            id: ev.id,
            kind: "system",
            sender: "SYSTEM",
            time: fmtTime(ev.createdAt),
            text: ev.payload?.text ?? `${ev.type}`,
        };
    });

    return mapped.filter(Boolean) as ChatMessage[];
}
