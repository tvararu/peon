export type WintergraspAnswer =
  | { status: "declined" }
  | { status: "queued"; battleId: number }
  | { status: "refused" }
  | { status: "entered"; battleId: number }
  | { status: "ejected"; battleId: number; reason: string }
  | { status: "left"; battleId: number; reason: string }
  | { status: "no_reply" };

export type WintergraspActs = {
  answerQueue: (accept: boolean) => Promise<WintergraspAnswer>;
  answerEntry: (accept: boolean) => Promise<WintergraspAnswer>;
  exitQueue: () => Promise<WintergraspAnswer>;
  hearthAndResurrect: () => Promise<{ status: "teleported" }>;
};
