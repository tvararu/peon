import { type Static, Type } from "@earendil-works/pi-ai";

export const restParams = Type.Object({
  until: Type.Optional(
    Type.Integer({
      description: "Stop at this percent of health and mana. Default 90.",
      maximum: 100,
      minimum: 50,
    }),
  ),
});

export type RestArgs = Static<typeof restParams>;
