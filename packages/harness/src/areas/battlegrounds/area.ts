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
type Status = Extract<BattlegroundsEvent, { type: "bg_status" }>;
type Invited = Extract<BattlegroundsEvent, { type: "bg_invited" }>;
type Left = Extract<BattlegroundsEvent, { type: "bg_left" }>;
type JoinResult = Extract<BattlegroundsEvent, { type: "bg_join_result" }>;
type Entered = Extract<BattlegroundsEvent, { type: "bg_entered" }>;
type LeftMatch = Extract<BattlegroundsEvent, { type: "bg_left_match" }>;
type Roster = Extract<
  BattlegroundsEvent,
  { type: "bg_player_joined" } | { type: "bg_player_left" }
>;
type Score = Extract<BattlegroundsEvent, { type: "bg_score" }>;
type Rez = Extract<BattlegroundsEvent, { type: "bg_rez_time" }>;

const BG_NAMES: Readonly<Record<number, string>> = {
  1: "Alterac Valley",
  2: "Warsong Gulch",
  3: "Arathi Basin",
  4: "Nagrand Arena",
  5: "Blade's Edge Arena",
  6: "arena",
  7: "Eye of the Storm",
  8: "Ruins of Lordaeron",
  9: "Strand of the Ancients",
  10: "Dalaran Sewers",
  11: "Ring of Valor",
  30: "Isle of Conquest",
  32: "Random Battleground",
};

function bgName(bgType: number | undefined): string {
  if (bgType === undefined) return "a battleground";
  return BG_NAMES[bgType] ?? `battleground ${bgType}`;
}

function statusRows(event: Status): AreaDraft[] {
  if (event.status.kind !== "queued" || event.previous === "queued") return [];
  return [
    {
      class: "log",
      data: {
        avgWaitMs: event.status.avgWaitMs,
        bgType: event.status.bgType,
        slot: event.slot,
      },
      name: "queued",
      text: `Queued for ${bgName(event.status.bgType)} in slot ${event.slot}.`,
    },
  ];
}

function invitedRow(event: Invited): AreaDraft {
  return {
    class: "wake",
    data: {
      bgType: event.bgType,
      expiresAt: event.expiresAt,
      mapId: event.mapId,
      slot: event.slot,
    },
    name: "invited",
    text: `Invited to ${bgName(event.bgType)} in slot ${event.slot}; the invitation expires at ${event.expiresAt}.`,
  };
}

function leftRows(event: Left): AreaDraft[] {
  if (event.previous !== "queued" && event.previous !== "invited") return [];
  return [
    {
      class: "log",
      data: {
        bgType: event.bgType,
        previous: event.previous,
        slot: event.slot,
      },
      name: "queue_left",
      text: `Left the ${bgName(event.bgType)} queue in slot ${event.slot}.`,
    },
  ];
}

function joinRows(event: JoinResult): AreaDraft[] {
  if (event.error === undefined) return [];
  return [
    {
      class: "log",
      data: { error: event.error, result: event.result },
      name: "join_failed",
      text: `Joining the battleground queue failed: ${event.error}.`,
    },
  ];
}

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

function enteredRow(event: Entered): AreaDraft {
  return {
    class: "log",
    data: { bgType: event.bgType, mapId: event.mapId },
    name: "entered",
    text: `Entered ${bgName(event.bgType)}.`,
  };
}

function leftMatchRow(event: LeftMatch): AreaDraft {
  return {
    class: "log",
    data: { mapId: event.mapId },
    name: "left",
    text: "Left the battleground.",
  };
}

function rosterRow(event: Roster, rc: RuleInput): AreaDraft {
  const joined = event.type === "bg_player_joined";
  return {
    class: "passive",
    data: { target: guidText(event.guid) },
    guid: guidText(event.guid),
    name: joined ? "joined" : "departed",
    ref: rc.refOf(event.guid),
    text: joined
      ? `${rc.refOf(event.guid)} joined the battleground.`
      : `${rc.refOf(event.guid)} left the battleground.`,
  };
}

function scoreText(event: Score): string {
  if (event.score.ended)
    return `The battleground ended; winner team ${event.score.winner}.`;
  return `Battleground score: ${event.score.players.length} players on the board.`;
}

function scoreRows(event: Score): AreaDraft[] {
  const row: AreaDraft = {
    class: event.score.ended ? "wake" : "log",
    data: {
      ended: event.score.ended,
      players: event.score.players.length,
      winner: event.score.winner,
    },
    name: "score",
    text: scoreText(event),
  };
  if (!event.score.ended) return [row];
  const ended: AreaDraft = {
    class: "wake",
    data: { winner: event.score.winner },
    name: "ended",
    text: scoreText(event),
  };
  return [row, ended];
}

function rezRow(event: Rez): AreaDraft {
  return {
    class: "passive",
    data: { ms: event.ms, nextAt: event.nextAt },
    name: "rez_time",
    text: `The next mass resurrection is in ${Math.round(event.ms / 1000)} s.`,
  };
}

function matchRows(
  event: Entered | LeftMatch | Roster | Score | Rez,
  rc: RuleInput,
): readonly AreaDraft[] {
  if (event.type === "bg_entered") return [enteredRow(event)];
  if (event.type === "bg_left_match") return [leftMatchRow(event)];
  if (event.type === "bg_player_joined" || event.type === "bg_player_left")
    return [rosterRow(event, rc)];
  if (event.type === "bg_score") return scoreRows(event);
  if (event.type === "bg_rez_time") return [rezRow(event)];
  return [];
}

function onEvent(
  event: BattlegroundsEvent,
  rc: RuleInput,
): readonly AreaDraft[] {
  if (event.type === "pvp_flag") return [flagRow(event)];
  if (event.type === "honor_credit") return [creditRow(event)];
  if (event.type === "zone_under_attack") return [alertRow(event)];
  if (event.type === "honor_inspect") return [inspectRow(event, rc)];
  if (event.type === "pvp_kill_quest") return [killRow(event)];
  if (event.type === "bg_status") return statusRows(event);
  if (event.type === "bg_invited") return [invitedRow(event)];
  if (event.type === "bg_left") return leftRows(event);
  if (event.type === "bg_join_result") return joinRows(event);
  if (event.type === "bg_carriers") return [];
  if (
    event.type === "bg_entered" ||
    event.type === "bg_left_match" ||
    event.type === "bg_player_joined" ||
    event.type === "bg_player_left" ||
    event.type === "bg_score" ||
    event.type === "bg_rez_time"
  )
    return matchRows(event, rc);
  return [];
}

export const battlegroundsHarness = defineHarnessArea({
  area: "battlegrounds",
  rules: () => ({ event: (event, rc) => onEvent(event, rc) }),
  worldActs: [
    "setPvp",
    "inspectHonor",
    "list",
    "hello",
    "join",
    "answer",
    "leaveQueue",
    "requestScore",
    "requestCarriers",
    "leaveBattleground",
    "reportAfk",
    "queueSpiritGuide",
  ],
});
