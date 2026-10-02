import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type BattlegroundsEvent = AreaEventOf<"battlegrounds">;
type Flag = Extract<BattlegroundsEvent, { type: "pvp_flag" }>;
type Credit = Extract<BattlegroundsEvent, { type: "honor_credit" }>;
type Alert = Extract<BattlegroundsEvent, { type: "zone_under_attack" }>;
type Inspect = Extract<BattlegroundsEvent, { type: "honor_inspect" }>;
type Kill = Extract<BattlegroundsEvent, { type: "pvp_kill_quest" }>;

function flagText(event: Flag): string {
  if (event.timer) return "PvP flag removal is counting down.";
  return event.wants ? "PvP flag is on." : "PvP flag is off.";
}

function flagRow(event: Flag): AreaDraft {
  return {
    class: "log",
    data: { flagged: event.flagged, timer: event.timer, wants: event.wants },
    name: "flag",
    text: flagText(event),
  };
}

function creditRow(event: Credit): AreaDraft {
  return {
    class: "log",
    data: { honor: event.honor, rank: event.rank },
    name: "honor",
    text: `Earned ${event.honor} honor.`,
  };
}

function alertRow(event: Alert): AreaDraft {
  return {
    class: "passive",
    data: { areaId: event.areaId },
    name: "zone_attack",
    text: `Zone ${event.areaId} is under attack.`,
  };
}

function inspectRow(event: Inspect, rc: RuleInput): AreaDraft {
  return {
    class: "log",
    data: {
      honor: event.honor,
      kills: event.kills,
      lifetime: event.lifetime,
      target: guidText(event.guid),
      today: event.today,
      yesterday: event.yesterday,
    },
    guid: guidText(event.guid),
    name: "inspect",
    ref: rc.refOf(event.guid),
    text: `${rc.refOf(event.guid)} holds ${event.honor} honor.`,
  };
}

function killRow(event: Kill): AreaDraft {
  return {
    class: "log",
    data: { count: event.count, quest: event.quest, required: event.required },
    name: "kill",
    text: `PvP kill ${event.count} of ${event.required} for quest ${event.quest}.`,
  };
}

function onEvent(
  event: BattlegroundsEvent,
  rc: RuleInput,
): readonly AreaDraft[] {
  if (event.type === "pvp_flag") return [flagRow(event)];
  if (event.type === "honor_credit") return [creditRow(event)];
  if (event.type === "zone_under_attack") return [alertRow(event)];
  if (event.type === "honor_inspect") return [inspectRow(event, rc)];
  return [killRow(event)];
}

export const battlegroundsHarness = defineHarnessArea({
  area: "battlegrounds",
  rules: () => ({ event: (event, rc) => onEvent(event, rc) }),
  worldActs: ["setPvp", "inspectHonor"],
});
