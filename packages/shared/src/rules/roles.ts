export type RoleId = 'TOWN' | 'MAFIA' | 'SHERIFF' | 'MAFIA_BOSS';
export type Alignment = 'TOWN' | 'MAFIA';

export type NightAbilityId = 'INVESTIGATE' | 'DECIDE_KILL' | 'GUESS_SHERIFF';

export interface RoleDefinition {
  id: RoleId;
  displayName: string;
  alignment: Alignment;
  nightAbilities: NightAbilityId[];
  description: string;
}

export const ROLES: Record<RoleId, RoleDefinition> = {
  TOWN: {
    id: 'TOWN',
    displayName: 'Town',
    alignment: 'TOWN',
    nightAbilities: [],
    description: 'No night abilities. Participates in day discussion and voting.'
  },
  MAFIA: {
    id: 'MAFIA',
    displayName: 'Mafia',
    alignment: 'MAFIA',
    nightAbilities: ['DECIDE_KILL'],
    description:
      'Participates in mafia night discussion, suggests kill target, and can vote in day.'
  },
  SHERIFF: {
    id: 'SHERIFF',
    displayName: 'Sheriff',
    alignment: 'TOWN',
    nightAbilities: ['INVESTIGATE'],
    description:
      'At night can investigate one alive player; receives private result: 👍 town-aligned, 👎 mafia-aligned.'
  },
  MAFIA_BOSS: {
    id: 'MAFIA_BOSS',
    displayName: 'Mafia Boss',
    alignment: 'MAFIA',
    nightAbilities: ['DECIDE_KILL', 'GUESS_SHERIFF'],
    description:
      'Final decision on mafia kill (or acting boss if dead). Additionally can guess the Sheriff at night and receive private yes/no.'
  }
};


