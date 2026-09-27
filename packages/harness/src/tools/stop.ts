import type { StopAfter } from "#harness/contract/details";
import { defineGameTool, emptyVitals, notBuilt } from "#harness/tools/define";
import { stopParams } from "#harness/tools/params";

function emptyStop(): StopAfter {
  return { attackers: [], self: emptyVitals(), stopped: [] };
}

export const stopTool = defineGameTool({
  fallback: emptyStop,
  kind: "control",
  name: "stop",
  parameters: stopParams,
  run: notBuilt,
});
