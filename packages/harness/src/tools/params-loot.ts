import { type Static, Type } from "@earendil-works/pi-ai";

export const lootParams = Type.Object({
  target: Type.Optional(
    Type.String({
      description:
        "Corpse unit id or name. Default: the nearest lootable corpse within 30 yd.",
    }),
  ),
});

export type LootArgs = Static<typeof lootParams>;
