export type PhaseKind = 'DAY' | 'NIGHT' | 'TRANSITION' | 'END';

export type PhaseActor =
  | 'HOST_ONLY'
  | 'ALL_ALIVE'
  | 'MAFIA_ALIVE'
  | 'MAFIA_BOSS_ONLY'
  | 'SHERIFF_ONLY'
  | 'SYSTEM';

export type PhaseId =
  | 'GAME_INIT'
  | 'DAY_DISCUSSION'
  | 'DAY_VOTING'
  | 'TIE_DISCUSSION'
  | 'TIE_REVOTE'
  | 'MASS_ELIMINATION_PROPOSAL'
  | 'ELIMINATION_SPEECH'
  | 'WIN_CHECK'
  | 'NIGHT_MAFIA_DISCUSSION'
  | 'NIGHT_MAFIA_BOSS_GUESS'
  | 'NIGHT_SHERIFF_ACTION'
  | 'NIGHT_KILL_RESOLUTION'
  | 'GAME_END';

export interface PhaseDefinition {
  id: PhaseId;
  displayName: string;
  kind: PhaseKind;
  whoActs: PhaseActor;
  description: string;
}

export const PHASES: Record<PhaseId, PhaseDefinition> = {
  GAME_INIT: {
    id: 'GAME_INIT',
    displayName: 'Game Init',
    kind: 'TRANSITION',
    whoActs: 'SYSTEM',
    description: 'Allocate players/roles (hidden), initialize day counter and derived indices.'
  },
  DAY_DISCUSSION: {
    id: 'DAY_DISCUSSION',
    displayName: 'Day Discussion',
    kind: 'DAY',
    whoActs: 'ALL_ALIVE',
    description:
      'Every alive player speaks exactly once. Speaking order rotates by day via discussionStartIndex (derived from day number).'
  },
  DAY_VOTING: {
    id: 'DAY_VOTING',
    displayName: 'Day Voting',
    kind: 'DAY',
    whoActs: 'ALL_ALIVE',
    description:
      'Host calls candidates; each alive player casts one vote per candidate call. Highest votes decide elimination or tie-handling.'
  },
  TIE_DISCUSSION: {
    id: 'TIE_DISCUSSION',
    displayName: 'Tie Discussion',
    kind: 'DAY',
    whoActs: 'ALL_ALIVE',
    description: 'Tie-break discussion among alive players before a revote.'
  },
  TIE_REVOTE: {
    id: 'TIE_REVOTE',
    displayName: 'Tie Revote',
    kind: 'DAY',
    whoActs: 'ALL_ALIVE',
    description:
      'Revote for tied candidates. Repeat up to maxVoteRounds; if still tied, proceed to mass elimination proposal.'
  },
  MASS_ELIMINATION_PROPOSAL: {
    id: 'MASS_ELIMINATION_PROPOSAL',
    displayName: 'Mass Elimination Proposal',
    kind: 'DAY',
    whoActs: 'ALL_ALIVE',
    description:
      'Host proposes eliminating all tied candidates. All alive vote yes/no once; majority yes eliminates all tied, otherwise nobody is eliminated.'
  },
  ELIMINATION_SPEECH: {
    id: 'ELIMINATION_SPEECH',
    displayName: 'Elimination Speech',
    kind: 'TRANSITION',
    whoActs: 'ALL_ALIVE',
    description:
      'Any removed player (lynch or night kill) gets a final speech. Roles are NOT revealed on death.'
  },
  WIN_CHECK: {
    id: 'WIN_CHECK',
    displayName: 'Win Check',
    kind: 'TRANSITION',
    whoActs: 'SYSTEM',
    description:
      'Mandatory gate after any elimination(s). Town wins if mafiaAliveCount === 0. Mafia wins if mafiaAliveCount >= townAliveCount. Otherwise continue.'
  },
  NIGHT_MAFIA_DISCUSSION: {
    id: 'NIGHT_MAFIA_DISCUSSION',
    displayName: 'Night: Mafia Discussion',
    kind: 'NIGHT',
    whoActs: 'MAFIA_ALIVE',
    description:
      'All alive mafia members speak once, suggesting kill target + reasoning. Speaking order rotates by night.'
  },
  NIGHT_MAFIA_BOSS_GUESS: {
    id: 'NIGHT_MAFIA_BOSS_GUESS',
    displayName: 'Night: Boss Sheriff Guess',
    kind: 'NIGHT',
    whoActs: 'MAFIA_BOSS_ONLY',
    description:
      'If Mafia Boss alive, boss points at one alive player. Host replies privately yes/no whether that player is Sheriff.'
  },
  NIGHT_SHERIFF_ACTION: {
    id: 'NIGHT_SHERIFF_ACTION',
    displayName: 'Night: Sheriff Action',
    kind: 'NIGHT',
    whoActs: 'SHERIFF_ONLY',
    description:
      'If Sheriff alive, investigates one alive player. Host replies privately: 👍 town-aligned or 👎 mafia-aligned.'
  },
  NIGHT_KILL_RESOLUTION: {
    id: 'NIGHT_KILL_RESOLUTION',
    displayName: 'Night: Kill Resolution',
    kind: 'TRANSITION',
    whoActs: 'SYSTEM',
    description:
      'Apply mafia kill target (if any), remove the target player, then proceed to elimination speech. Mafia cannot target mafia (self/teammate kill disallowed).'
  },
  GAME_END: {
    id: 'GAME_END',
    displayName: 'Game End',
    kind: 'END',
    whoActs: 'SYSTEM',
    description: 'End of game. Roles may be revealed only here (no reveals on death).'
  }
};

export const PHASE_ORDER: PhaseId[] = [
  'GAME_INIT',
  'DAY_DISCUSSION',
  'DAY_VOTING',
  'TIE_DISCUSSION',
  'TIE_REVOTE',
  'MASS_ELIMINATION_PROPOSAL',
  'ELIMINATION_SPEECH',
  'WIN_CHECK',
  'NIGHT_MAFIA_DISCUSSION',
  'NIGHT_MAFIA_BOSS_GUESS',
  'NIGHT_SHERIFF_ACTION',
  'NIGHT_KILL_RESOLUTION',
  'WIN_CHECK',
  'GAME_END'
];


