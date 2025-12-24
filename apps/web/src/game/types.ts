export type LocalPhaseId =
  | 'DAY_DISCUSSION'
  | 'DAY_VOTING'
  | 'TIE_DISCUSSION'
  | 'TIE_REVOTE'
  | 'MASS_ELIMINATION_PROPOSAL'
  | 'ELIMINATION_SPEECH'
  | 'NIGHT_MAFIA_DISCUSSION'
  | 'NIGHT_MAFIA_KILL_SELECT'
  | 'NIGHT_MAFIA_BOSS_GUESS'
  | 'NIGHT_SHERIFF_ACTION'
  | 'NIGHT_SLEEP'
  | 'MORNING_REVEAL'
  | 'WIN_CHECK'
  | 'GAME_END';

export type ApiEventKind = 'system' | 'host' | 'player';

export type ApiGameEventType =
  | 'GAME_CREATED'
  | 'GAME_SETUP'
  | 'GAME_ENDED'
  | 'NIGHT_STARTED'
  | 'NIGHT_RESULT'
  | 'NIGHT_ENDED'
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

export type ApiGameEvent = {
  id: string;
  type: ApiGameEventType;
  kind: ApiEventKind;
  createdAt: string;
  payload: any;
};

export type ApiPlayerRef = { id: string; seatNumber: number; name: string; nickname: string };
export type ApiHostRef = { id: string; name: string; nickname: string };

export type ApiGameMeta = {
  id: string;
  createdAt: string;
  endedAt?: string;
  players: ApiPlayerRef[];
  host: ApiHostRef;
};

export type LocalLoopState = {
  phaseId: LocalPhaseId;
  dayNumber: number;
  currentSpeakerSeatNumber: number;
};

export type Bubble = { text: string; until: number };


