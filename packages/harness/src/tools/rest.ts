import type { RestAfter } from "#harness/contract/details";
import { defineGameTool, notBuilt } from "#harness/tools/define";
import { restParams } from "#harness/tools/params";

function emptyRest(): RestAfter {
  return {
    auraConfirmed: false,
    durationMs: 0,
    hpPct: 0,
    idle: false,
    itemsLeft: 0,
    manaPct: undefined,
    used: [],
  };
}

export const restTool = defineGameTool({
  fallback: emptyRest,
  kind: "run",
  name: "rest",
  parameters: restParams,
  run: notBuilt,
});
