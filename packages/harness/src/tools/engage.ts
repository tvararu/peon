import type { EngageAfter } from "#harness/contract/details";
import { defineGameTool, emptyVitals, notBuilt } from "#harness/tools/define";
import { engageParams } from "#harness/tools/params";

function emptyEngage(): EngageAfter {
  return {
    cast: undefined,
    castErrors: [],
    copper: 0,
    current: undefined,
    decisions: [],
    how: "",
    kills: 0,
    loot: [],
    mode: "single",
    questId: undefined,
    self: emptyVitals(),
    swingErrors: [],
    targets: [],
    timeouts: 0,
    wanted: 1,
    xp: 0,
  };
}

export const engageTool = defineGameTool({
  fallback: emptyEngage,
  kind: "run",
  name: "engage",
  parameters: engageParams,
  run: notBuilt,
});
