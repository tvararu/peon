import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";

export const dungeonParams = Type.Object({
  accept: Type.Optional(
    Type.Boolean({
      description:
        "For bind and answer: false refuses the prompt. For kick_vote: the vote. Default true.",
    }),
  ),
  auto: Type.Optional(
    Type.Boolean({
      description:
        "For queue: answer role checks and proposals automatically. Default true.",
    }),
  ),
  do: Type.Optional(
    StringEnum(
      [
        "status",
        "difficulty",
        "reset",
        "bind",
        "extend",
        "queue",
        "leave_queue",
        "answer",
        "roles",
        "teleport",
        "kick_vote",
      ],
      {
        description: "status: difficulty, saves and the queue. Default status.",
      },
    ),
  ),
  dungeon: Type.Optional(
    Type.Number({
      description: "For queue: the dungeon id. Default first unlocked random.",
    }),
  ),
  extended: Type.Optional(
    Type.Boolean({
      description: "For extend: false shortens the lock. Default true.",
    }),
  ),
  for: Type.Optional(
    StringEnum(["dungeon", "raid"], {
      description: "Which difficulty the difficulty verb sets.",
    }),
  ),
  map: Type.Optional(
    Type.Number({
      description: "For extend: the saved map id whose lock changes.",
    }),
  ),
  roles: Type.Optional(
    Type.Array(StringEnum(["tank", "healer", "damage"]), {
      description: "For queue and roles. Default damage.",
    }),
  ),
  to: Type.Optional(
    StringEnum(["in", "out"], {
      description: "For teleport: into or out of the dungeon.",
    }),
  ),
  value: Type.Optional(
    Type.String({
      description:
        "The new difficulty: normal or heroic for a dungeon; 10, 25, 10-heroic or 25-heroic for a raid.",
    }),
  ),
});

export type DungeonArgs = Static<typeof dungeonParams>;
