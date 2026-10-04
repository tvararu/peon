import { type Static, Type } from "@earendil-works/pi-ai";

export const travelParams = Type.Object({
  for: Type.Optional(
    Type.String({
      description:
        'With explore: what to look for. "hostile", "questgiver", "vendor" or part of a unit name. Default hostile: units you can fight that are not gray or critters. Other units do not stop the walk.',
    }),
  ),
  to: Type.String({
    description:
      'A unit id (u4), a unit name, "corpse", "hearth", "explore" or "explore north" (any of north, south, east, west, northeast, northwest, southeast, southwest), "10 yd north" (a distance of 1 to 200 yards and a compass direction), "unstick", "ride <stop>" (for example "ride Thunder Bluff"; needs a boat or zeppelin dock in view), "fly <destination>" (for example "fly Silvermoon City"; needs a flight master and a discovered flight path), or coordinates "8764, -6683" or "8764, -6683, 72.7".',
  }),
  within: Type.Optional(
    Type.Number({
      description:
        "Stop this many yards from the goal. Default 3 for a unit, 1 for coordinates.",
      maximum: 40,
      minimum: 1,
    }),
  ),
});

export type TravelArgs = Static<typeof travelParams>;
