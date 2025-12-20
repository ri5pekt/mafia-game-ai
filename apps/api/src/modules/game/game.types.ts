export type GameId = string;

export type SeatNumber = number; // 1..10

export type GamePhaseId =
  | 'DAY_DISCUSSION'
  | 'DAY_VOTING'
  | 'TIE_DISCUSSION'
  | 'TIE_REVOTE'
  | 'MASS_ELIMINATION_PROPOSAL'
  | 'ELIMINATION_SPEECH'
  | 'NIGHT_MAFIA_DISCUSSION'
  | 'NIGHT_MAFIA_BOSS_GUESS'
  | 'NIGHT_SHERIFF_ACTION'
  | 'MORNING_REVEAL'
  | 'WIN_CHECK'
  | 'GAME_END';

export type EventKind = 'system' | 'host' | 'player';

export type GameEventType =
  | 'GAME_CREATED'
  | 'GAME_SETUP'
  | 'GAME_ENDED'
  | 'HOST_MESSAGE'
  | 'PLAYER_SPEAK'
  | 'PLAYER_NOMINATE'
  | 'PLAYER_VOTE'
  | 'MASS_ELIMINATION_VOTE'
  | 'PLAYER_ELIMINATED'
  | 'NIGHT_KILL_SUGGEST'
  | 'NIGHT_KILL_SELECT'
  | 'NIGHT_BOSS_GUESS'
  | 'NIGHT_SHERIFF_INVESTIGATE'
  | 'WIN_RESULT'
  | 'TURN_ENDED'
  | 'PHASE_CHANGED';

export type GameEvent = {
  id: string;
  type: GameEventType;
  kind: EventKind;
  createdAt: string; // ISO
  payload: any;
};

export type PlayerRef = {
  id: string;
  seatNumber: SeatNumber;
  name: string;
  nickname: string;
};

export type HostRef = {
  id: string;
  name: string;
  nickname: string;
};

/**
 * Server stores meta + append-only event log.
 * Frontend rebuilds state by replaying events (frontend-loop).
 */
export type GameMeta = {
  id: GameId;
  createdAt: string; // ISO
  endedAt?: string; // ISO
  players: PlayerRef[];
  host: HostRef;
};

export type CreateGameRequest = {
  players: PlayerRef[];
  host: HostRef;
};

export type AppendEventRequest = {
  type: GameEventType;
  kind: EventKind;
  payload: any;
};


