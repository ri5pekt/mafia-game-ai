export type AiActionKind = "DAY_DISCUSSION_SPEAK";

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
};

export type AiDayDiscussionSpeak = {
    say: string;
    nominateSeatNumber: number | null;
};

export type AiActResponse = {
    requestId: string;
    model: string;
    prompt: string;
    outputText: string;
    parsed: AiDayDiscussionSpeak | null;
    parseError?: string;
    openaiRequest?: any;
    openaiResponse?: any;
};
