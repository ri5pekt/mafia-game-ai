export type PlayerId = string;
export type Role = 'MAFIA' | 'SHERIFF' | 'TOWN';
export type GamePhase = 'DAY' | 'NIGHT';

export interface GameEvent {
  id: string;
  type: string;
  payload: any;
}


