import type { RecoverAfter } from "#harness/contract/details";
import { defineGameTool, notBuilt } from "#harness/tools/define";
import { recoverParams } from "#harness/tools/params";

function emptyRecover(): RecoverAfter {
  return {
    alive: false,
    alternatives: [],
    corpseYd: undefined,
    durationMs: 0,
    hp: undefined,
    legs: 0,
    maxHp: undefined,
    pose: undefined,
    via: "corpse",
  };
}

export const recoverTool = defineGameTool({
  fallback: emptyRecover,
  kind: "run",
  name: "recover",
  parameters: recoverParams,
  run: notBuilt,
});
