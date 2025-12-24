export type PlayerPreset = {
    id: string;
    role?: "host";
    gender: "female" | "male" | "neutral";
    name: string;
    nickname: string;
    avatar: string;
    profile: string;
    tts: {
        languageCode: string;
        voiceName: string;
        speakingRate: number;
        pitch: number;
    };
};

type PresetBase = Omit<PlayerPreset, "tts">;

// en-US Standard voices are gendered (per Google's metadata).
// Keep assignments consistent with character gender to avoid jarring mismatches.
const EN_US_STANDARD_MALE = [
    "en-US-Standard-A",
    "en-US-Standard-B",
    "en-US-Standard-D",
    "en-US-Standard-I",
    "en-US-Standard-J",
] as const;
const EN_US_STANDARD_FEMALE = [
    "en-US-Standard-C",
    "en-US-Standard-E",
    "en-US-Standard-F",
    "en-US-Standard-G",
    "en-US-Standard-H",
] as const;
const EN_US_STANDARD_ALL = [...EN_US_STANDARD_MALE, ...EN_US_STANDARD_FEMALE] as const;

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function makeTts(p: PresetBase, idx: number): PlayerPreset["tts"] {
    const voicePool =
        p.gender === "male" ? EN_US_STANDARD_MALE : p.gender === "female" ? EN_US_STANDARD_FEMALE : EN_US_STANDARD_ALL;
    const voiceName = voicePool[idx % voicePool.length];
    const languageCode = "en-US";

    // Spread pacing a bit; keep in a natural range.
    // 0.85..1.15
    const speakingRate = clamp(1.0 + ((idx % 9) - 4) * 0.025, 0.85, 1.15);

    // Gender-ish pitch baseline with per-character variation.
    const basePitch = p.gender === "male" ? -3.0 : p.gender === "female" ? 2.0 : 0.0;
    const variance = ((idx % 11) - 5) * 0.55; // ~-2.75..+3.3
    let pitch = clamp(basePitch + variance, -8.0, 8.0);

    // Hosts: a touch slower / more “authoritative”.
    if (p.role === "host") {
        pitch = clamp(pitch - 0.8, -8.0, 8.0);
        return { languageCode, voiceName, speakingRate: clamp(speakingRate - 0.04, 0.85, 1.15), pitch };
    }

    return { languageCode, voiceName, speakingRate, pitch };
}

const PRESET_BASE: PresetBase[] = [
    {
        id: "host_1",
        role: "host",
        gender: "male",
        name: "Victor Hale",
        nickname: "The Prosecutor",
        avatar: "host-1.png",
        profile:
            "Age 58, former state prosecutor. Formal, intimidating, runs the game with strict discipline. Interrupts players who ramble.",
    },
    {
        id: "host_2",
        role: "host",
        gender: "male",
        name: "Samuel Crowe",
        nickname: "The Noir",
        avatar: "host-2.png",
        profile:
            "Age 47, crime novelist. Speaks in short, dramatic lines. Leans into suspense and psychological tension.",
    },
    {
        id: "host_3",
        role: "host",
        gender: "female",
        name: "Elena Varga",
        nickname: "The Analyst",
        avatar: "host-3.png",
        profile:
            "Age 42, behavioral psychologist. Calm, precise, highlights subtle behavioral patterns after each phase.",
    },
    {
        id: "host_4",
        role: "host",
        gender: "female",
        name: "Natalie Cross",
        nickname: "The Ice Queen",
        avatar: "host-4.png",
        profile:
            "Age 36, intelligence operations handler. Emotionless delivery, no commentary, creates pressure through silence.",
    },

    {
        id: "p1",
        gender: "female",
        name: "Clara Voss",
        nickname: "Second Thought",
        avatar: "p1.png",
        profile:
            "Age 33, intelligence analyst. Rarely speaks first, but when she does, it reframes the entire discussion.",
    },
    {
        id: "p2",
        gender: "female",
        name: "Mara Kane",
        nickname: "Pressure Point",
        avatar: "p2.png",
        profile:
            "Age 29, private investigator. Aggressive eye contact, direct accusations, thrives on making others uncomfortable.",
    },
    {
        id: "p3",
        gender: "female",
        name: "Evelyn Crowe",
        nickname: "Side Smile",
        avatar: "p3.png",
        profile: "Age 26, jazz singer. Uses charm and ambiguity, hides intent behind casual remarks.",
    },
    {
        id: "p4",
        gender: "female",
        name: "Lydia Moore",
        nickname: "The Anchor",
        avatar: "p4.png",
        profile: "Age 35, legal researcher. Calm, grounded, others instinctively trust her judgment.",
    },
    {
        id: "p5",
        gender: "female",
        name: "Nina Bell",
        nickname: "False Innocence",
        avatar: "p5.png",
        profile: "Age 24, art student. Appears naïve, but watches everything; dangerous if ignored.",
    },

    {
        id: "p6",
        gender: "male",
        name: "Anton Blake",
        nickname: "Hard Stop",
        avatar: "p6.png",
        profile: "Age 41, corporate fixer. Authoritative tone, shuts down weak arguments fast.",
    },
    {
        id: "p7",
        gender: "male",
        name: "Frank Dalton",
        nickname: "Old School",
        avatar: "p7.png",
        profile: "Age 50, union negotiator. Traditional thinker, values consistency and past behavior.",
    },
    {
        id: "p8",
        gender: "male",
        name: "Leo March",
        nickname: "Street Sense",
        avatar: "p8.png",
        profile: "Age 34, investigative photographer. Reads people more than words, distrusts polished speeches.",
    },
    {
        id: "p9",
        gender: "male",
        name: "Julian Cross",
        nickname: "Cold Logic",
        avatar: "p9.png",
        profile: "Age 37, risk analyst. Detached, methodical, openly challenges emotional decisions.",
    },
    {
        id: "p10",
        gender: "male",
        name: "Victor Lane",
        nickname: "Final Argument",
        avatar: "p10.png",
        profile: "Age 39, defense attorney. Speaks late, delivers decisive closing pushes.",
    },

    {
        id: "p11",
        gender: "female",
        name: "Irene Walsh",
        nickname: "The Librarian",
        avatar: "p11.png",
        profile: "Age 31, archivist. Quiet observer, remembers exact phrasing and timing.",
    },
    {
        id: "p12",
        gender: "female",
        name: "Tessa Bloom",
        nickname: "Doubt Seed",
        avatar: "p12.png",
        profile: "Age 27, philosophy grad. Asks unsettling questions that destabilize alliances.",
    },
    {
        id: "p13",
        gender: "female",
        name: "Helena Roth",
        nickname: "Veiled Threat",
        avatar: "p13.png",
        profile: "Age 34, antique dealer. Controlled, elegant, implies more than she says.",
    },
    {
        id: "p14",
        gender: "female",
        name: "Sophie Hart",
        nickname: "Open Card",
        avatar: "p14.png",
        profile: "Age 25, journalism intern. Transparent, emotional, surprisingly effective at drawing reactions.",
    },
    {
        id: "p15",
        gender: "female",
        name: "Valerie Stone",
        nickname: "Golden Tongue",
        avatar: "p15.png",
        profile: "Age 32, PR consultant. Smooth persuasion, reframes accusations as misunderstandings.",
    },

    {
        id: "p16",
        gender: "male",
        name: "Edgar Wynn",
        nickname: "Deep Focus",
        avatar: "p16.png",
        profile: "Age 48, forensic accountant. Silent early, devastating when presenting evidence.",
    },
    {
        id: "p17",
        gender: "male",
        name: "Marcus Reed",
        nickname: "Iron Will",
        avatar: "p17.png",
        profile: "Age 45, homicide detective. Unshakeable, trusts experience over group opinion.",
    },
    {
        id: "p18",
        gender: "male",
        name: "Noah Pike",
        nickname: "Short Fuse",
        avatar: "p18.png",
        profile: "Age 28, nightclub security. Reacts emotionally, easy to provoke, dangerous in chaos.",
    },
    {
        id: "p19",
        gender: "male",
        name: "Adrian Cole",
        nickname: "Glass Wall",
        avatar: "p19.png",
        profile: "Age 36, tech consultant. Polite, guarded, reveals nothing unless forced.",
    },
    {
        id: "p20",
        gender: "male",
        name: "Rafael Moreno",
        nickname: "Silent Verdict",
        avatar: "p20.png",
        profile: "Age 40, appellate judge clerk. Says little, but his vote often decides outcomes.",
    },
    {
        id: "p21",
        gender: "female",
        name: "Aiko Tan",
        nickname: "Fresh Eyes",
        avatar: "p21.png",
        profile: "Age 22, game design student. Notices patterns veterans ignore, asks naive-but-sharp questions.",
    },
    {
        id: "p22",
        gender: "female",
        name: "Rin Ashcroft",
        nickname: "Shadow Watcher",
        avatar: "p22.png",
        profile: "Age 24, night shift barista. Quiet, observant, thrives in low-information environments.",
    },
    {
        id: "p23",
        gender: "female",
        name: "Kara Volkov",
        nickname: "Steel Spine",
        avatar: "p23.png",
        profile: "Age 31, private security contractor. Direct, no-nonsense, votes decisively.",
    },
    {
        id: "p24",
        gender: "male",
        name: "Elliot Crane",
        nickname: "Over the Shoulder",
        avatar: "p24.png",
        profile: "Age 34, investigative blogger. Constantly reassessing alliances, prone to sudden reversals.",
    },
    {
        id: "p25",
        gender: "male",
        name: "Max Orion",
        nickname: "Edge Runner",
        avatar: "p25.png",
        profile: "Age 28, startup founder. High-risk thinker, pushes bold plays, loves controlled chaos.",
    },
    {
        id: "p26",
        gender: "male",
        name: "Jun Park",
        nickname: "Still Water",
        avatar: "p26.png",
        profile: "Age 25, engineering student. Minimal emotion, difficult to read, rarely defends himself.",
    },
    {
        id: "p27",
        gender: "female",
        name: "Vera Knox",
        nickname: "Flash Point",
        avatar: "p27.png",
        profile: "Age 29, investigative podcaster. Sharp instincts, emotional delivery, escalates tension fast.",
    },

    {
        id: "p28",
        gender: "female",
        name: "Elena Ruiz",
        nickname: "Soft Probe",
        avatar: "p28.png",
        profile: "Age 27, UX researcher. Asks gentle questions to extract hidden intent.",
    },
    {
        id: "p29",
        gender: "male",
        name: "Dominic Vale",
        nickname: "The Godfather",
        avatar: "p29.png",
        profile: "Age 58, retired crime attorney. Commands respect, speaks rarely, carries weight when he does.",
    },
    {
        id: "p30",
        gender: "male",
        name: "Caleb North",
        nickname: "Middle Ground",
        avatar: "p30.png",
        profile: "Age 35, operations manager. Mediator by nature, delays votes, seeks consensus.",
    },
    {
        id: "p31",
        gender: "female",
        name: "Yuna Mori",
        nickname: "Late Bloom",
        avatar: "p31.png",
        profile: "Age 23, linguistics student. Silent early game, unexpectedly articulate under pressure.",
    },
    {
        id: "p32",
        gender: "male",
        name: "Hiro Tanaka",
        nickname: "Black Ice",
        avatar: "p32.png",
        profile: "Age 40, logistics director. Emotionless delivery, relentless logic, zero tolerance for theatrics.",
    },
    {
        id: "p33",
        gender: "male",
        name: "Owen Frost",
        nickname: "Street Signal",
        avatar: "p33.png",
        profile: "Age 31, rideshare driver. Reads tone and pacing better than words, distrusts elites.",
    },
    {
        id: "p34",
        gender: "female",
        name: "Luna Park",
        nickname: "Mirror Face",
        avatar: "p34.png",
        profile: "Age 26, acting coach. Adapts personality to the room, reflects others back at them.",
    },
];

export const PLAYERS_PRESET: PlayerPreset[] = PRESET_BASE.map((p, idx) => ({
    ...p,
    tts: makeTts(p, idx),
}));

export function getPlayerAvatarUrl(avatarFilename: string): string {
    return new URL(`../assets/images/players/${avatarFilename}`, import.meta.url).href;
}
