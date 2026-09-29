import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";

export const recoverParams = Type.Object({
  how: Type.Optional(
    StringEnum(["corpse", "spirit_healer", "accept", "self"], {
      description:
        "Default corpse: walk back to your body. accept: take a resurrection offer. self: come back where you died with a Soulstone or Reincarnation.",
    }),
  ),
});

export type RecoverArgs = Static<typeof recoverParams>;
