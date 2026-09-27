import type { LookAfter } from "#harness/contract/details";
import {
  defineGameTool,
  emptyPlace,
  emptySelf,
  notBuilt,
} from "#harness/tools/define";
import { lookParams } from "#harness/tools/params";

function emptyLook(): LookAfter {
  return {
    danger: { attackers: [], hpPct: 100 },
    filter: "any",
    matched: 0,
    name: undefined,
    nearest: {},
    place: emptyPlace(),
    rows: [],
    run: undefined,
    seen: 0,
    self: emptySelf(),
    target: undefined,
    unchanged: 0,
    within: undefined,
  };
}

export const lookTool = defineGameTool({
  fallback: emptyLook,
  kind: "read",
  maxLines: 24,
  name: "look",
  parameters: lookParams,
  run: notBuilt,
});
