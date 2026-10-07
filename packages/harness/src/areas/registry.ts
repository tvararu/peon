import type { AreaName } from "@peon/core";
import { accountHarness } from "#harness/areas/account/area";
import { achievementsHarness } from "#harness/areas/achievements/area";
import { ambienceHarness } from "#harness/areas/ambience/area";
import { arenaHarness } from "#harness/areas/arena/area";
import { auctionHarness } from "#harness/areas/auction/area";
import { bankHarness } from "#harness/areas/bank/area";
import { battlegroundsHarness } from "#harness/areas/battlegrounds/area";
import { buybackHarness } from "#harness/areas/buyback/area";
import { calendarHarness } from "#harness/areas/calendar/area";
import { channelsHarness } from "#harness/areas/channels/area";
import { characterHarness } from "#harness/areas/character/area";
import { chartersHarness } from "#harness/areas/charters/area";
import { combatlogHarness } from "#harness/areas/combatlog/area";
import { complaintsHarness } from "#harness/areas/complaints/area";
import { contactsHarness } from "#harness/areas/contacts/area";
import { emotesHarness } from "#harness/areas/emotes/area";
import { guildadminHarness } from "#harness/areas/guildadmin/area";
import { guildbankHarness } from "#harness/areas/guildbank/area";
import { inspectHarness } from "#harness/areas/inspect/area";
import { instancesHarness } from "#harness/areas/instances/area";
import { itemsHarness } from "#harness/areas/items/area";
import { lfgHarness } from "#harness/areas/lfg/area";
import { loginHarness } from "#harness/areas/login/area";
import { lootingHarness } from "#harness/areas/looting/area";
import { mailHarness } from "#harness/areas/mail/area";
import { objectsHarness } from "#harness/areas/objects/area";
import { petsHarness } from "#harness/areas/pets/area";
import { questsHarness } from "#harness/areas/quests/area";
import { raidHarness } from "#harness/areas/raid/area";
import { reputationHarness } from "#harness/areas/reputation/area";
import { selfstateHarness } from "#harness/areas/selfstate/area";
import { spellsHarness } from "#harness/areas/spells/area";
import { talentsHarness } from "#harness/areas/talents/area";
import { threatHarness } from "#harness/areas/threat/area";
import { timeHarness } from "#harness/areas/time/area";
import { tradeHarness } from "#harness/areas/trade/area";
import { transportsHarness } from "#harness/areas/transports/area";
import { travelHarness } from "#harness/areas/travel/area";
import { unitmotionHarness } from "#harness/areas/unitmotion/area";
import { vehiclesHarness } from "#harness/areas/vehicles/area";

export const HARNESS_AREAS = {
  account: accountHarness,
  achievements: achievementsHarness,
  ambience: ambienceHarness,
  arena: arenaHarness,
  auction: auctionHarness,
  bank: bankHarness,
  battlegrounds: battlegroundsHarness,
  buyback: buybackHarness,
  calendar: calendarHarness,
  channels: channelsHarness,
  character: characterHarness,
  charters: chartersHarness,
  combatlog: combatlogHarness,
  complaints: complaintsHarness,
  contacts: contactsHarness,
  emotes: emotesHarness,
  guildadmin: guildadminHarness,
  guildbank: guildbankHarness,
  inspect: inspectHarness,
  instances: instancesHarness,
  items: itemsHarness,
  lfg: lfgHarness,
  login: loginHarness,
  looting: lootingHarness,
  mail: mailHarness,
  objects: objectsHarness,
  pets: petsHarness,
  quests: questsHarness,
  raid: raidHarness,
  reputation: reputationHarness,
  selfstate: selfstateHarness,
  spells: spellsHarness,
  talents: talentsHarness,
  threat: threatHarness,
  time: timeHarness,
  trade: tradeHarness,
  transports: transportsHarness,
  travel: travelHarness,
  unitmotion: unitmotionHarness,
  vehicles: vehiclesHarness,
};
export const HARNESS_AREAS_TOTAL: [
  Exclude<AreaName, keyof typeof HARNESS_AREAS>,
] extends [never]
  ? true
  : never = true;
