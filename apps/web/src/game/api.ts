import type { ApiGameEvent, ApiGameMeta, ApiHostRef, ApiPlayerRef } from "./types";

export const DEFAULT_API_BASE = "http://localhost:3000";

export async function apiFetch<T>(apiBase: string, path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${apiBase}${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
}

export async function getActiveGame(apiBase: string) {
    return apiFetch<ApiGameMeta | null>(apiBase, "/game/active");
}

export async function getGameMeta(apiBase: string, gameId: string) {
    return apiFetch<ApiGameMeta>(apiBase, `/game/${gameId}`);
}

export async function getGameEvents(apiBase: string, gameId: string) {
    return apiFetch<ApiGameEvent[]>(apiBase, `/game/${gameId}/events`);
}

export async function createGame(apiBase: string, req: { players: ApiPlayerRef[]; host: ApiHostRef }) {
    return apiFetch<ApiGameMeta>(apiBase, "/game", {
        method: "POST",
        body: JSON.stringify(req),
    });
}

export async function appendGameEvent(
    apiBase: string,
    gameId: string,
    e: { type: ApiGameEvent["type"]; kind: ApiGameEvent["kind"]; payload: any }
) {
    return apiFetch<ApiGameEvent>(apiBase, `/game/${gameId}/events`, {
        method: "POST",
        body: JSON.stringify(e),
    });
}

export async function endGame(apiBase: string, gameId: string) {
    return apiFetch<{ game: ApiGameMeta; event: ApiGameEvent }>(apiBase, `/game/${gameId}/end`, {
        method: "POST",
        body: JSON.stringify({}),
    });
}

export function connectGameSse(apiBase: string, gameId: string, onIncoming: (e: ApiGameEvent) => void) {
    const es = new EventSource(`${apiBase}/game/${gameId}/stream`);
    es.addEventListener("event", (ev) => {
        try {
            const parsed = JSON.parse((ev as MessageEvent).data);
            const incoming = parsed?.event as ApiGameEvent | undefined;
            if (!incoming?.id) return;
            onIncoming(incoming);
        } catch {
            // ignore
        }
    });
    return es;
}
