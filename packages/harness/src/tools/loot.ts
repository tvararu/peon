import type { LootAfter } from "#harness/contract/details";
import { defineGameTool, notBuilt } from "#harness/tools/define";
import { lootParams } from "#harness/tools/params";

function emptyLoot(): LootAfter {
  return {
    copper: 0,
    corpse: undefined,
    freeSlots: undefined,
    items: [],
    windowClosed: false,
  };
}

export const lootTool = defineGameTool({
  fallback: emptyLoot,
  kind: "action",
  name: "loot",
  parameters: lootParams,
  run: notBuilt,
});
