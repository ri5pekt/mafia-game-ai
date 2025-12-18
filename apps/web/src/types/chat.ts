export type ChatMessageKind = "host" | "player" | "system";

export type ChatMessage = {
  id: string;
  kind: ChatMessageKind;
  sender: string;
  time: string;
  text: string;
};


