import type { AreaName } from "@peon/core";
import { achievementsHarness } from "#harness/areas/achievements/area";
import { ambienceHarness } from "#harness/areas/ambience/area";
import { buybackHarness } from "#harness/areas/buyback/area";
import { combatlogHarness } from "#harness/areas/combatlog/area";
import { emotesHarness } from "#harness/areas/emotes/area";
import { instancesHarness } from "#harness/areas/instances/area";
import { itemsHarness } from "#harness/areas/items/area";
import { loginHarness } from "#harness/areas/login/area";
import { lootingHarness } from "#harness/areas/looting/area";
import { objectsHarness } from "#harness/areas/objects/area";
import { petsHarness } from "#harness/areas/pets/area";
import { questsHarness } from "#harness/areas/quests/area";
import { reputationHarness } from "#harness/areas/reputation/area";
import { selfstateHarness } from "#harness/areas/selfstate/area";
import { spellsHarness } from "#harness/areas/spells/area";
import { talentsHarness } from "#harness/areas/talents/area";
import { threatHarness } from "#harness/areas/threat/area";
import { timeHarness } from "#harness/areas/time/area";
import { travelHarness } from "#harness/areas/travel/area";
import { unitmotionHarness } from "#harness/areas/unitmotion/area";

export const HARNESS_AREAS = {
  achievements: achievementsHarness,
  ambience: ambienceHarness,
  buyback: buybackHarness,
  combatlog: combatlogHarness,
  emotes: emotesHarness,
  instances: instancesHarness,
  items: itemsHarness,
  login: loginHarness,
  looting: lootingHarness,
  objects: objectsHarness,
  pets: petsHarness,
  quests: questsHarness,
  reputation: reputationHarness,
  selfstate: selfstateHarness,
  spells: spellsHarness,
  talents: talentsHarness,
  threat: threatHarness,
  time: timeHarness,
  travel: travelHarness,
  unitmotion: unitmotionHarness,
};
export const HARNESS_AREAS_TOTAL: [
  Exclude<AreaName, keyof typeof HARNESS_AREAS>,
] extends [never]
  ? true
  : never = true;
