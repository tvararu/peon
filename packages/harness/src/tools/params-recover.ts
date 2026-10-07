import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";

export const recoverParams = Type.Object({
  how: Type.Optional(
    StringEnum(["corpse", "spirit_healer", "spirit_guide", "accept", "self"], {
      description:
        "Default corpse: walk back to your body. spirit_guide: queue at a battleground spirit guide for the mass resurrection. accept: take a resurrection offer. self: come back where you died with a Soulstone or Reincarnation.",
    }),
  ),
});

export type RecoverArgs = Static<typeof recoverParams>;
