import { type Static, Type } from "@earendil-works/pi-ai";

export const stopParams = Type.Object({
  run: Type.Optional(
    Type.String({ description: "Run id like r3. Default: stop everything." }),
  ),
});

export type StopArgs = Static<typeof stopParams>;
