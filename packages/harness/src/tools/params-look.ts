import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";

const LOOK_KINDS = [
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
] as const;

export const lookParams = Type.Object({
  find: Type.Optional(
    StringEnum(LOOK_KINDS, {
      description: "What kind of unit to list. Default: any.",
    }),
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

export type LookArgs = Static<typeof lookParams>;

export function prepareLookArgs(args: unknown): LookArgs {
  const find =
    args && typeof args === "object" && "find" in args ? args.find : undefined;
  if (typeof find === "string" && !LOOK_KINDS.some((kind) => kind === find))
    throw new Error(
      `Validation failed for tool "look":\n  - find: find takes a kind (hostile, questgiver, vendor, ...). For a name use name: "${find}".`,
    );
  return args as LookArgs;
}
