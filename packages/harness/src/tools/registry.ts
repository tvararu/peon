import { arenaTool } from "#harness/areas/arena/tool";
import { calendarTool } from "#harness/areas/calendar/tool";
import { channelTool } from "#harness/areas/channels/tool";
import { characterTool } from "#harness/areas/character/tool";
import { guildTool } from "#harness/areas/guildadmin/tool";
import { guildbankTool } from "#harness/areas/guildbank/tool";
import { dungeonTool } from "#harness/areas/instances/tool";
import { gearTool } from "#harness/areas/items/tool";
import { mailTool } from "#harness/areas/mail/tool";
import { useTool } from "#harness/areas/objects/tool";
import { petTool } from "#harness/areas/pets/tool";
import { groupTool } from "#harness/areas/raid/tool";
import { spellTool } from "#harness/areas/spells/tool";
import { talentsTool } from "#harness/areas/talents/tool";
import { tradeTool } from "#harness/areas/trade/tool";
import { vehicleTool } from "#harness/areas/vehicles/tool";
import type { ToolName } from "#harness/contract/result";
import { engageTool } from "#harness/tools/engage";
import { interactTool } from "#harness/tools/interact";
import { journalTool } from "#harness/tools/journal";
import { lookTool } from "#harness/tools/look";
import { lootTool } from "#harness/tools/loot";
import { pilotTool } from "#harness/tools/pilot";
import { recoverTool } from "#harness/tools/recover";
import { restTool } from "#harness/tools/rest";
import { socialTool } from "#harness/tools/social";
import { stopTool } from "#harness/tools/stop";
import { travelTool } from "#harness/tools/travel";

export const GAME_TOOLS = [
  lookTool,
  travelTool,
  engageTool,
  pilotTool,
  lootTool,
  interactTool,
  restTool,
  recoverTool,
  socialTool,
  journalTool,
  stopTool,
  gearTool,
  useTool,
  spellTool,
  petTool,
  dungeonTool,
  groupTool,
  tradeTool,
  guildbankTool,
  characterTool,
  talentsTool,
  mailTool,
  vehicleTool,
  guildTool,
  channelTool,
  arenaTool,
  calendarTool,
] as const;

type Listed = (typeof GAME_TOOLS)[number]["name"];

export const ALL_TOOLS_LISTED: [Exclude<ToolName, Listed>] extends [never]
  ? true
  : never = true;
