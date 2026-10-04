import { type Static, Type } from "@earendil-works/pi-ai";

const point = Type.Object({
  x: Type.Number({ description: "World x." }),
  y: Type.Number({ description: "World y." }),
});

export const pilotParams = Type.Object(
  {
    circle: Type.Optional(
      Type.Object({
        direction: Type.Union([
          Type.Literal("clockwise"),
          Type.Literal("counterclockwise"),
        ]),
        radius: Type.Number({
          description: "Circle radius in yards.",
          minimum: 1,
        }),
        x: Type.Number({ description: "Circle centre x." }),
        y: Type.Number({ description: "Circle centre y." }),
      }),
    ),
    minutes: Type.Optional(
      Type.Number({
        description: "Time budget in minutes. Default 3, max 10.",
        maximum: 10,
        minimum: 0.1,
      }),
    ),
    to: Type.Optional(point),
  },
  { description: "Exactly one of to or circle." },
);

export type PilotArgs = Static<typeof pilotParams>;
