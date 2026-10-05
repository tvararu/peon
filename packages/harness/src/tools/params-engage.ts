import { type Static, Type } from "@earendil-works/pi-ai";

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
  kite: Type.Optional(
    Type.Boolean({
      description:
        "Keep the target outside its melee reach: slow or root it, move away, cast when safe. Default false.",
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

export type EngageArgs = Static<typeof engageParams>;
