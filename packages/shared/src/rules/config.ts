export interface RulesetConfig {
  maxVoteRounds: number;
  allowSelfKill: boolean;
  revealRolesOnDeath: boolean;
  discussionRotation: 'BY_DAY';
  mafiaRotation: 'BY_NIGHT';
}

export const DEFAULT_RULESET_CONFIG: RulesetConfig = {
  maxVoteRounds: 3,
  allowSelfKill: false,
  revealRolesOnDeath: false,
  discussionRotation: 'BY_DAY',
  mafiaRotation: 'BY_NIGHT'
};


