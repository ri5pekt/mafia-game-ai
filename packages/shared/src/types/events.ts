import type { PhaseId } from '../rules';
import type { PlayerId } from './game';

export type GameEventId = string;
export type GameEventType = string; // placeholder (will become a union later)

export interface GameEvent<TType extends GameEventType = GameEventType, TPayload = unknown> {
  id: GameEventId;
  type: TType;
  payload: TPayload;
  createdAt: string; // ISO string placeholder
}

// A few placeholder event payload shapes to guide development (no logic).
export interface PhaseChangedPayload {
  from: PhaseId;
  to: PhaseId;
}

export interface PlayerEliminatedPayload {
  playerId: PlayerId;
  reason: 'VOTE' | 'NIGHT_KILL' | 'MASS_ELIMINATION';
}


