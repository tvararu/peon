import type { TravelAfter } from "#harness/contract/details";
import { defineGameTool, notBuilt } from "#harness/tools/define";
import { travelParams } from "#harness/tools/params";

function emptyTravel(): TravelAfter {
  return {
    elapsedMs: 0,
    floorRetried: false,
    floors: undefined,
    goal: { direction: undefined, kind: "explore" },
    legs: [],
    newInView: [],
    pose: undefined,
    remainingYd: undefined,
    totalYd: undefined,
    traveledYd: 0,
  };
}

export const travelTool = defineGameTool({
  fallback: emptyTravel,
  kind: "run",
  name: "travel",
  parameters: travelParams,
  run: notBuilt,
});
