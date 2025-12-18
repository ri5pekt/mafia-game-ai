export type PlayerPreset = {
  id: string;
  gender: "female" | "male";
  name: string;
  nickname: string;
  avatar: string; // filename under src/assets/images/players/
};

export const PLAYERS_PRESET: PlayerPreset[] = [
  {
    id: "p1",
    gender: "female",
    name: "Emily Carter",
    nickname: "The Whisper",
    avatar: "p1.png",
  },
  {
    id: "p2",
    gender: "female",
    name: "Sarah Mitchell",
    nickname: "Sharp Eyes",
    avatar: "p2.png",
  },
  {
    id: "p3",
    gender: "female",
    name: "Olivia Brooks",
    nickname: "Cold Read",
    avatar: "p3.png",
  },
  {
    id: "p4",
    gender: "female",
    name: "Jessica Turner",
    nickname: "The Planner",
    avatar: "p4.png",
  },
  {
    id: "p5",
    gender: "female",
    name: "Hannah Reed",
    nickname: "Soft Voice",
    avatar: "p5.png",
  },
  {
    id: "p6",
    gender: "male",
    name: "Michael Hayes",
    nickname: "Stone Face",
    avatar: "p6.png",
  },
  {
    id: "p7",
    gender: "male",
    name: "Daniel Foster",
    nickname: "Fast Talker",
    avatar: "p7.png",
  },
  {
    id: "p8",
    gender: "male",
    name: "James Walker",
    nickname: "Dead Calm",
    avatar: "p8.png",
  },
  {
    id: "p9",
    gender: "male",
    name: "Robert Collins",
    nickname: "Numbers Guy",
    avatar: "p9.png",
  },
  {
    id: "p10",
    gender: "male",
    name: "Thomas Bennett",
    nickname: "The Closer",
    avatar: "p10.png",
  },
];

export function getPlayerAvatarUrl(avatarFilename: string): string {
  return new URL(`../assets/images/players/${avatarFilename}`, import.meta.url).href;
}


