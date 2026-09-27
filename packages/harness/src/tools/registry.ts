import type { HarnessRuntime } from "#harness/contract/services";
import type { GameTool } from "#harness/tools/define";
import { engageTool } from "#harness/tools/engage";
import { interactTool } from "#harness/tools/interact";
import { journalTool } from "#harness/tools/journal";
import { lookTool } from "#harness/tools/look";
import { lootTool } from "#harness/tools/loot";
import { recoverTool } from "#harness/tools/recover";
import { restTool } from "#harness/tools/rest";
import { socialTool } from "#harness/tools/social";
import { stopTool } from "#harness/tools/stop";
import { travelTool } from "#harness/tools/travel";

const TOOLS = [
  lookTool,
  travelTool,
  engageTool,
  lootTool,
  interactTool,
  restTool,
  recoverTool,
  socialTool,
  journalTool,
  stopTool,
];

export function gameTools(rt: HarnessRuntime): GameTool[] {
  return TOOLS.map((make) => make(rt));
}
