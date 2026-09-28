import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";

export const journalParams = Type.Object({
  about: StringEnum(["quests", "bags", "spells", "log"], {
    description:
      "quests: your own quest log. bags: money, free bag slots, equipped gear (main hand and others) and items. spells: spells you know, the auras you can cancel and your action bar. log: what happened earlier.",
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

export type JournalArgs = Static<typeof journalParams>;
