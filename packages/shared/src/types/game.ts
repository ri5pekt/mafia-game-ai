import type { Alignment, PhaseId, RoleId } from '../rules';

export type PlayerId = string;

export type PublicRoleRevealPolicy = 'NEVER' | 'GAME_END_ONLY';

export interface PlayerPublic {
  id: PlayerId;
  name: string;
  alive: boolean;
}

// Secret role is intentionally not part of the public player shape.
export interface PlayerSecret {
  id: PlayerId;
  roleId: RoleId;
  alignment: Alignment;
}

export interface GameCounters {
  dayNumber: number; // starts at 1
  nightNumber: number; // starts at 1
}

export interface PhaseState {
  id: PhaseId;
  startedAt: string; // ISO string; placeholder
}

export interface GameStatePublic {
  id: string;
  phase: PhaseState;
  counters: GameCounters;
  players: PlayerPublic[];
  roleRevealPolicy: PublicRoleRevealPolicy;
}

// Placeholder for orchestrator internal state. We deliberately avoid gameplay logic here.
export interface GameStateInternal extends GameStatePublic {
  secrets: {
    players: PlayerSecret[];
  };
}


