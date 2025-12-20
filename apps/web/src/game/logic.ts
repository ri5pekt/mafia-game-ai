import type { ApiGameEvent, ApiGameEventType, LocalLoopState, LocalPhaseId } from './types';

export function aliveSeatsFromEvents(events: ApiGameEvent[]): Set<number> {
  const alive = new Set<number>(Array.from({ length: 10 }, (_, i) => i + 1));
  for (const ev of events) {
    if (ev.type === 'PLAYER_ELIMINATED') {
      const seat = Number(ev.payload?.seatNumber);
      if (Number.isFinite(seat)) alive.delete(seat);
    }
  }
  return alive;
}

export function phaseWindowEvents(events: ApiGameEvent[], phaseId: LocalPhaseId): ApiGameEvent[] {
  let start = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === 'PHASE_CHANGED' && ev.payload?.to === phaseId) {
      start = i;
      break;
    }
  }
  return events.slice(start);
}

export function nomineesFromDiscussion(events: ApiGameEvent[], alive: Set<number>): number[] {
  const w = phaseWindowEvents(events, 'DAY_DISCUSSION');
  const set = new Set<number>();
  for (const ev of w) {
    if (ev.type === 'PLAYER_NOMINATE') {
      const t = Number(ev.payload?.targetSeatNumber);
      if (Number.isFinite(t) && alive.has(t)) set.add(t);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function tieCandidatesFromPhaseChange(events: ApiGameEvent[], phaseId: LocalPhaseId): number[] {
  const w = phaseWindowEvents(events, phaseId);
  for (let i = w.length - 1; i >= 0; i--) {
    const ev = w[i];
    if (ev.type === 'PHASE_CHANGED') {
      const c = ev.payload?.candidates;
      if (Array.isArray(c)) return c.map((x: any) => Number(x)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
      break;
    }
  }
  return [];
}

export function eliminationQueueFromPhaseChange(events: ApiGameEvent[], phaseId: LocalPhaseId): number[] {
  const w = phaseWindowEvents(events, phaseId);
  for (let i = w.length - 1; i >= 0; i--) {
    const ev = w[i];
    if (ev.type === 'PHASE_CHANGED') {
      const e = ev.payload?.eliminated;
      if (Array.isArray(e)) return e.map((x: any) => Number(x)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
      break;
    }
  }
  return [];
}

export function rebuildLoopStateFromEvents(events: ApiGameEvent[]): LocalLoopState {
  let phaseId: LocalPhaseId = 'DAY_DISCUSSION';
  let dayNumber = 1;

  const alive = new Set<number>(Array.from({ length: 10 }, (_, i) => i + 1));
  let order: number[] = Array.from(alive);
  let idx = 0;

  let tieCandidates: number[] = [];
  let eliminationQueue: number[] = [];
  let elimIdx = 0;
  let phaseSpeakers: number[] | null = null;

  const recomputeOrderForPhase = () => {
    const aliveArr = Array.from(alive).sort((a, b) => a - b);
    switch (phaseId) {
      case 'DAY_DISCUSSION':
      case 'DAY_VOTING':
      case 'TIE_REVOTE':
      case 'MASS_ELIMINATION_PROPOSAL':
        order = aliveArr;
        idx = 0;
        break;
      case 'NIGHT_MAFIA_DISCUSSION':
      case 'NIGHT_MAFIA_BOSS_GUESS':
      case 'NIGHT_SHERIFF_ACTION':
      case 'MORNING_REVEAL':
        order = (phaseSpeakers?.length ? [...phaseSpeakers] : aliveArr).filter((n) => alive.has(n));
        idx = 0;
        break;
      case 'TIE_DISCUSSION':
        order = [...tieCandidates].sort((a, b) => a - b);
        idx = 0;
        break;
      case 'ELIMINATION_SPEECH':
        order = [...eliminationQueue];
        elimIdx = 0;
        break;
      case 'WIN_CHECK':
      case 'GAME_END':
        order = aliveArr;
        idx = 0;
        break;
    }
  };

  for (const ev of events) {
    if (ev.type === 'PLAYER_ELIMINATED') {
      const seat = Number(ev.payload?.seatNumber);
      if (Number.isFinite(seat)) alive.delete(seat);
    }

    if (ev.type === 'PHASE_CHANGED') {
      const to = ev.payload?.to as LocalPhaseId | undefined;
      if (to) {
        phaseId = to;
        // Some phases define explicit speaker order.
        const speakers = ev.payload?.speakers;
        if (Array.isArray(speakers)) {
          phaseSpeakers = speakers.map((x: any) => Number(x)).filter((n) => Number.isFinite(n));
        } else {
          phaseSpeakers = null;
        }
        if (to === 'TIE_DISCUSSION' || to === 'TIE_REVOTE' || to === 'MASS_ELIMINATION_PROPOSAL') {
          const c = ev.payload?.candidates;
          if (Array.isArray(c)) tieCandidates = c.map((x: any) => Number(x)).filter((n) => Number.isFinite(n));
        }
        if (to === 'ELIMINATION_SPEECH') {
          const e = ev.payload?.eliminated;
          if (Array.isArray(e)) eliminationQueue = e.map((x: any) => Number(x)).filter((n) => Number.isFinite(n));
          else eliminationQueue = [];
        }
        recomputeOrderForPhase();
      }
    }

    if (ev.type === 'TURN_ENDED') {
      if (phaseId === 'ELIMINATION_SPEECH') {
        elimIdx = Math.min(elimIdx + 1, Math.max(0, order.length - 1));
      } else {
        idx = Math.min(idx + 1, Math.max(0, order.length - 1));
      }
    }

    if (ev.type === 'GAME_ENDED') {
      phaseId = 'GAME_END';
      recomputeOrderForPhase();
    }
  }

  const currentSpeakerSeatNumber = phaseId === 'ELIMINATION_SPEECH' ? (order[elimIdx] ?? 1) : (order[idx] ?? 1);
  return { phaseId, dayNumber, currentSpeakerSeatNumber };
}

export function voteByVoter(events: ApiGameEvent[], phaseId: LocalPhaseId): Map<number, number> {
  const w = phaseWindowEvents(events, phaseId);
  const m = new Map<number, number>();
  for (const ev of w) {
    if (ev.type === 'PLAYER_VOTE') {
      const voter = Number(ev.payload?.voterSeatNumber);
      const target = Number(ev.payload?.targetSeatNumber);
      if (Number.isFinite(voter) && Number.isFinite(target)) m.set(voter, target);
    }
  }
  return m;
}

export function voteCounts(events: ApiGameEvent[], phaseId: LocalPhaseId, candidates: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const c of candidates) counts.set(c, 0);
  const w = phaseWindowEvents(events, phaseId);
  for (const ev of w) {
    if (ev.type !== 'PLAYER_VOTE') continue;
    const target = Number(ev.payload?.targetSeatNumber);
    if (Number.isFinite(target) && counts.has(target)) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return counts;
}

export function hasEvent(events: ApiGameEvent[], type: ApiGameEventType, predicate?: (e: ApiGameEvent) => boolean): boolean {
  return events.some((e) => e.type === type && (predicate ? predicate(e) : true));
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}


