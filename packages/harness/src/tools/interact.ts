import type { InteractAfter } from "#harness/contract/details";
import { defineGameTool, emptyUnit, notBuilt } from "#harness/tools/define";
import { interactParams } from "#harness/tools/params";

function emptyInteract(): InteractAfter {
  return {
    action: "talk",
    bought: undefined,
    dialogOpened: false,
    freeSlots: undefined,
    gossip: [],
    learned: [],
    money: undefined,
    npc: emptyUnit(),
    offers: [],
    repairCost: undefined,
    rewardChoices: [],
    roles: [],
    sold: [],
    spells: [],
    stock: [],
  };
}

export const interactTool = defineGameTool({
  fallback: emptyInteract,
  kind: "action",
  name: "interact",
  parameters: interactParams,
  run: notBuilt,
});
