export type AiActionKind =
    | "DAY_DISCUSSION_SPEAK"
    | "DAY_VOTING_DECIDE_ALL"
    | "TIE_REVOTE_DECIDE_ALL"
    | "MASS_ELIMINATION_PROPOSAL_DECIDE_ALL"
    | "ELIMINATION_SPEECH_LAST_WORDS"
    | "NIGHT_MAFIA_DISCUSSION_SPEAK"
    | "NIGHT_MAFIA_BOSS_DISCUSSION_SELECT_KILL_GUESS_SHERIFF"
    | "NIGHT_MAFIA_BOSS_GUESS_SHERIFF"
    | "NIGHT_SHERIFF_INVESTIGATE";

export type AiPersona = {
    seatNumber: number;
    roleId: "TOWN" | "SHERIFF" | "MAFIA" | "MAFIA_BOSS";
    name: string;
    nickname?: string;
    profile?: string;
};

export type AiActRequest = {
    model?: string;
    action: AiActionKind;
    phaseId: string;
    gameId: string;
    roleLogText: string;
    persona: AiPersona;
    aliveSeatNumbers?: number[];
    /**
     * Optional list of valid kill target seats (used during night mafia actions).
     */
    killTargetSeatNumbers?: number[];
    /**
     * Optional list of seats that are currently awake and participating in the discussion (e.g. mafia seats at night).
     */
    awakeSeatNumbers?: number[];
    /**
     * Optional list of valid investigation target seats (used during sheriff night action).
     */
    investigateTargetSeatNumbers?: number[];
    /**
     * Optional list of vote candidates (used for DAY_VOTING / TIE_REVOTE bulk voting).
     */
    voteCandidateSeatNumbers?: number[];
};

export type AiDayDiscussionSpeak = {
    say: string;
    nominateSeatNumber: number | null;
};

export type AiNightMafiaDiscussionSpeak = {
    say: string;
    suggestKillSeatNumber: number | null;
};

export type AiNightMafiaBossSelectKill = {
    selectKillSeatNumber: number | null;
};

export type AiNightMafiaBossDiscussionSelectKill = {
    say: string;
    selectKillSeatNumber: number | null;
};

export type AiNightMafiaBossDiscussionSelectKillGuessSheriff = {
    say: string;
    selectKillSeatNumber: number | null;
    guessSheriffSeatNumber: number;
};

export type AiNightMafiaBossGuessSheriff = {
    guessSheriffSeatNumber: number;
};

export type AiNightSheriffInvestigate = {
    investigateSeatNumber: number;
};

export type AiEliminationSpeechLastWords = {
    say: string;
};

export type AiVote = { voterSeatNumber: number; targetSeatNumber: number };
export type AiVoteAll = { votes: AiVote[] };

export type AiMassVote = { voterSeatNumber: number; vote: "YES" | "NO" };
export type AiMassVoteAll = { votes: AiMassVote[] };

export type AiActResponse = {
    requestId: string;
    model: string;
    roleLogCharCount: number;
    promptCharCount: number;
    openaiLatencyMs: number;
    prompt: string;
    outputText: string;
    parsed:
        | AiDayDiscussionSpeak
        | AiVoteAll
        | AiMassVoteAll
        | AiEliminationSpeechLastWords
        | AiNightMafiaDiscussionSpeak
        | AiNightMafiaBossDiscussionSelectKillGuessSheriff
        | AiNightMafiaBossGuessSheriff
        | AiNightSheriffInvestigate
        | null;
    parseError?: string;
    openaiRequest?: any;
    openaiResponse?: any;
};
