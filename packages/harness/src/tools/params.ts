import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";

export const lookParams = Type.Object({
  find: Type.Optional(
    StringEnum(
      [
        "any",
        "hostile",
        "attackable",
        "questgiver",
        "vendor",
        "trainer",
        "repair",
        "lootable",
        "player",
        "corpse",
        "spirit_healer",
      ],
      {
        description: "What kind of unit to list. Default: any.",
      },
    ),
  ),
  name: Type.Optional(
    Type.String({ description: 'Part of a unit name, for example "Stalker".' }),
  ),
  within: Type.Optional(
    Type.Integer({
      description:
        "List every unit within this many yards (up to 20 rows). Default: the 6 nearest within 60 yd.",
      maximum: 100,
      minimum: 5,
    }),
  ),
});

export const travelParams = Type.Object({
  to: Type.String({
    description:
      'A unit id (u4), a unit name, "corpse", "explore" or "explore north" (any of north, south, east, west, northeast, northwest, southeast, southwest), "unstick", or coordinates "8764, -6683" or "8764, -6683, 72.7".',
  }),
  within: Type.Optional(
    Type.Number({
      description:
        "Stop this many yards from the goal. Default 3 for a unit, 1 for coordinates.",
      maximum: 40,
      minimum: 1,
    }),
  ),
});

export const engageParams = Type.Object({
  count: Type.Optional(
    Type.Integer({
      description:
        "How many kills of this kind of creature. Default 1; with quest, the kills the quest still needs.",
      maximum: 10,
      minimum: 1,
    }),
  ),
  how: Type.Optional(
    Type.String({
      description:
        'Short instruction for the fight helper, for example "only Smite".',
      maxLength: 120,
    }),
  ),
  loot: Type.Optional(
    Type.Boolean({ description: "Loot each kill. Default true." }),
  ),
  quest: Type.Optional(
    Type.String({
      description:
        'Quest id like "8325" or the quest title from journal: fight the creatures its objectives need.',
    }),
  ),
  target: Type.Optional(
    Type.String({
      description:
        'Unit id (u9) or name ("Springpaw Stalker"). Default: the nearest hostile you can attack.',
    }),
  ),
});

export const lootParams = Type.Object({
  target: Type.Optional(
    Type.String({
      description:
        "Corpse unit id or name. Default: the nearest lootable corpse within 30 yd.",
    }),
  ),
});

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
      ],
      { description: "Default talk: list what this NPC offers." },
    ),
  ),
  npc: Type.String({ description: "NPC unit id (u3) or the NPC's name." }),
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
        'Line number or title from the talk list, gossip option number, or part of an item name to buy ("water").',
    }),
  ),
});

export const restParams = Type.Object({
  until: Type.Optional(
    Type.Integer({
      description: "Stop at this percent of health and mana. Default 90.",
      maximum: 100,
      minimum: 50,
    }),
  ),
});

export const recoverParams = Type.Object({
  how: Type.Optional(
    StringEnum(["corpse", "spirit_healer", "accept"], {
      description:
        "Default corpse: walk back to your body. accept: take a resurrection offer.",
    }),
  ),
});

export const socialParams = Type.Object({
  do: Type.Optional(
    StringEnum(
      [
        "say",
        "whisper",
        "party",
        "guild",
        "invite",
        "accept_invite",
        "decline_invite",
        "leave_group",
      ],
      {
        description: "Default: whisper when to is set, else say.",
      },
    ),
  ),
  text: Type.Optional(
    Type.String({ description: "What to say.", maxLength: 255 }),
  ),
  to: Type.Optional(
    Type.String({
      description:
        "Exact player name for whisper or invite, as the [game] line shows it.",
    }),
  ),
});

export const journalParams = Type.Object({
  about: StringEnum(["quests", "bags", "spells", "log"], {
    description:
      "quests: your own quest log. bags: money, free bag slots, equipped gear (main hand and others) and items. spells: spells you know. log: what happened earlier.",
  }),
  find: Type.Optional(
    Type.String({
      description: 'For log: words to search, "from:Name" or "domain:quest".',
    }),
  ),
  since: Type.Optional(
    Type.String({
      description:
        'For log: "5m", a run id like "r4", or "last_turn". Default last_turn.',
    }),
  ),
});

export const stopParams = Type.Object({
  run: Type.Optional(
    Type.String({ description: "Run id like r3. Default: stop everything." }),
  ),
});

export type LookArgs = Static<typeof lookParams>;
export type TravelArgs = Static<typeof travelParams>;
export type EngageArgs = Static<typeof engageParams>;
export type LootArgs = Static<typeof lootParams>;
export type InteractArgs = Static<typeof interactParams>;
export type RestArgs = Static<typeof restParams>;
export type RecoverArgs = Static<typeof recoverParams>;
export type SocialArgs = Static<typeof socialParams>;
export type JournalArgs = Static<typeof journalParams>;
export type StopArgs = Static<typeof stopParams>;
