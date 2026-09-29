import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";

type LootingEvent = AreaEventOf<"looting">;
type Of<T extends LootingEvent["type"]> = Extract<LootingEvent, { type: T }>;

function candidateNames(
  event: Of<"master_loot_candidates">,
  rc: RuleInput,
): string[] {
  return event.candidates.map((guid) => {
    if (guid === rc.selfGuid) return rc.selfName;
    return rc.lookup.unitName(guid) ?? `0x${guid.toString(16)}`;
  });
}

function masterLootCandidates(
  event: Of<"master_loot_candidates">,
  rc: RuleInput,
): AreaDraft[] {
  return [
    {
      class: "passive",
      data: { candidates: candidateNames(event, rc) },
      name: "master_loot",
      text: `Master loot candidates: ${candidateNames(event, rc).join(", ")}.`,
    },
  ];
}

function rule(event: LootingEvent, rc: RuleInput): AreaDraft[] {
  switch (event.type) {
    case "master_loot_candidates":
      return masterLootCandidates(event, rc);
    default:
      return [];
  }
}

export const lootingHarness = defineHarnessArea({
  area: "looting",
  rules: () => ({ event: rule }),
  worldActs: [],
});
