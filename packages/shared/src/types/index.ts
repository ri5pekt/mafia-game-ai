export type { PlayerId, PublicRoleRevealPolicy } from './game';
export type {
  GameCounters,
  GameStateInternal,
  GameStatePublic,
  PhaseState,
  PlayerPublic,
  PlayerSecret
} from './game';

export type { GameEvent, GameEventId, GameEventType } from './events';
export type { PhaseChangedPayload, PlayerEliminatedPayload } from './events';

// Re-export the canonical IDs from rules so consumers can import from @shared/types.
export type { Alignment, PhaseId, RoleId } from '../rules';


