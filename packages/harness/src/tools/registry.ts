import { gearTool } from "#harness/areas/items/tool";
import type { ToolName } from "#harness/contract/result";
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

export const GAME_TOOLS = [
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
  gearTool,
] as const;

type Listed = (typeof GAME_TOOLS)[number]["name"];

export const ALL_TOOLS_LISTED: [Exclude<ToolName, Listed>] extends [never]
  ? true
  : never = true;
