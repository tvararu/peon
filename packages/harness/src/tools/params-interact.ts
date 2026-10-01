import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";

export const interactParams = Type.Object({
  count: Type.Optional(
    Type.Integer({
      description:
        "How many times to buy. One buy gives the vendor's stack (water: 5). Default 1.",
      maximum: 20,
      minimum: 1,
    }),
  ),
  do: Type.Optional(
    StringEnum(
      [
        "talk",
        "accept",
        "turn_in",
        "gossip",
        "buy",
        "sell_junk",
        "train",
        "repair",
        "bind",
        "buyback",
        "reset_talents",
      ],
      { description: "Default talk: list what this NPC offers." },
    ),
  ),
  max_cost: Type.Optional(
    Type.Integer({
      description:
        "The most copper reset_talents may pay. Without it the step only names the cost.",
      minimum: 0,
    }),
  ),
  npc: Type.String({
    description:
      "NPC unit id (u3) or the NPC's name, or a quest-giver object id (o1) or name.",
  }),
  reward: Type.Optional(
    Type.Integer({
      description: "Reward choice number for turn_in.",
      maximum: 6,
      minimum: 1,
    }),
  ),
  what: Type.Optional(
    Type.String({
      description:
        'Line number or title from the talk list, gossip option number, or for buy a stock line number, part of an item name ("water") or "item <id>".',
    }),
  ),
});

export type InteractArgs = Static<typeof interactParams>;
