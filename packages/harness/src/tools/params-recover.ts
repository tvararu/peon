import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";

export const recoverParams = Type.Object({
  how: Type.Optional(
    StringEnum(["corpse", "spirit_healer", "accept"], {
      description:
        "Default corpse: walk back to your body. accept: take a resurrection offer.",
    }),
  ),
});

export type RecoverArgs = Static<typeof recoverParams>;
