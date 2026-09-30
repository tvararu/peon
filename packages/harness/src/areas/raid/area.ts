import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { markRows, pingRows } from "#harness/areas/raid/rules-marks";
import type { RuleInput } from "#harness/events/rules";

type RaidEvent = AreaEventOf<"raid">;
type Of<T extends RaidEvent["type"]> = Extract<RaidEvent, { type: T }>;

function flagLabel(flag: string): string {
  switch (flag) {
    case "main_tank":
      return "main tank";
    case "main_assist":
      return "main assist";
    default:
      return flag;
  }
}

function groupLabel(index: number): string {
  return `group ${index + 1}`;
}

function rosterText(change: Of<"group_list">["changes"][number]): string {
  const name = "name" in change ? change.name : undefined;
  const who = name ?? "You";
  switch (change.kind) {
    case "converted":
      return "The group changed shape.";
    case "subgroup":
      return `${who} moved to ${groupLabel(change.to)}.`;
    case "flag":
      return change.on
        ? `${who} gained ${flagLabel(change.flag)}.`
        : `${who} lost ${flagLabel(change.flag)}.`;
    case "loot":
      return "The loot rules changed.";
    case "difficulty":
      return "The difficulty changed.";
    case "leader":
      return name ? `${name} leads the group now.` : "You lead the group now.";
    case "disbanded":
      return "The group disbanded.";
    default:
      return "The roster changed.";
  }
}

function changeDetail(change: Of<"group_list">["changes"][number]) {
  switch (change.kind) {
    case "flag":
      return { flag: change.flag, on: change.on };
    case "subgroup":
      return { from: change.from, to: change.to };
    default:
      return {};
  }
}

function groupList(event: Of<"group_list">): AreaDraft[] {
  const rows: AreaDraft[] = [];
  for (const change of event.changes) {
    if (change.kind === "left") {
      rows.push({
        class: "passive",
        data: { change: change.kind, name: change.name },
        name: "roster",
        text: `${change.name} left the group.`,
      });
      continue;
    }
    if (change.kind === "joined") continue;
    const name = "name" in change ? change.name : undefined;
    rows.push({
      class: "passive",
      data: {
        change: change.kind,
        ...changeDetail(change),
        ...(name ? { name } : {}),
      },
      name: "roster",
      text: rosterText(change),
    });
  }
  return rows;
}

function transitionText(transition: string, name: string): string {
  switch (transition) {
    case "died":
      return `${name} died.`;
    case "ghost":
      return `${name} released spirit.`;
    case "revived":
      return `${name} revived.`;
    case "offline":
      return `${name} went offline.`;
    case "online":
      return `${name} came online.`;
    default:
      return `${name} changed.`;
  }
}

function inviteBlocked(event: Of<"invite_blocked">): AreaDraft[] {
  return [
    {
      class: "log",
      data: { name: event.name },
      name: "invite_blocked",
      text: `${event.name} tried to invite you, but you are already in a group.`,
    },
  ];
}

function memberStats(event: Of<"member_stats">): AreaDraft[] {
  return [...event.transitions].sort().map((transition) => ({
    class: "passive" as const,
    data: { name: event.name, transition },
    name: "member" as const,
    text: transitionText(transition, event.name),
  }));
}

function answerText(answer: Of<"ready_check_answer">): string {
  switch (answer.answer) {
    case "ready":
      return `${answer.name} is ready.`;
    case "offline":
      return `${answer.name} is offline.`;
    default:
      return `${answer.name} is not ready.`;
  }
}

function readyDoneText(finished: Of<"ready_check_finished">): string {
  const parts = [`${finished.ready} ready`];
  if (finished.notReady.length > 0)
    parts.push(`not ready: ${finished.notReady.join(", ")}`);
  if (finished.offline > 0) parts.push(`${finished.offline} offline`);
  if (finished.pending > 0) parts.push(`${finished.pending} did not answer`);
  return `The ready check finished: ${parts.join("; ")}.`;
}

function commandResult(event: Of<"command_result">): AreaDraft[] {
  return [
    {
      class: "wake" as const,
      data: {
        member: event.member,
        operation: event.operation,
        result: event.result,
      },
      name: "command" as const,
      text: `${event.operation} answered ${event.result}.`,
    },
  ];
}

function readyStarted(event: Of<"ready_check_started">): AreaDraft[] {
  return [
    {
      class: "wake" as const,
      data: { name: event.name },
      name: "ready_check" as const,
      text:
        event.name === ""
          ? "You start a ready check."
          : `${event.name} starts a ready check.`,
    },
  ];
}

function readyAnswer(event: Of<"ready_check_answer">): AreaDraft[] {
  return [
    {
      class: "passive" as const,
      data: { answer: event.answer, name: event.name },
      name: "ready_answer" as const,
      text: answerText(event),
    },
  ];
}

function readyFinished(event: Of<"ready_check_finished">): AreaDraft[] {
  return [
    {
      class: "passive" as const,
      data: {
        notReady: [...event.notReady],
        offline: event.offline,
        pending: event.pending,
        ready: event.ready,
      },
      name: "ready_done" as const,
      text: readyDoneText(event),
    },
  ];
}

function disbanded(): AreaDraft[] {
  return [
    {
      class: "passive",
      data: {},
      name: "roster",
      text: "The group disbanded.",
    },
  ];
}

function summonerName(name: string, summoner: bigint, rc: RuleInput): string {
  if (name !== "") return name;
  return rc.lookup.unitName(summoner) ?? "Someone";
}

function summonRequested(
  event: Of<"summon_requested">,
  rc: RuleInput,
): AreaDraft[] {
  const who = summonerName(event.name, event.summoner, rc);
  const zone = event.zoneName ?? `zone ${event.zoneId}`;
  const seconds = Math.round(event.timeoutMs / 1000);
  return [
    {
      class: "wake",
      data: { name: who, seconds, summoner: `${event.summoner}`, zone },
      name: "summon",
      text: `${who} summons you to ${zone}. Answer within ${seconds} s.`,
    },
  ];
}

function summonExpired(
  event: Of<"summon_expired">,
  rc: RuleInput,
): AreaDraft[] {
  const who = summonerName(event.name, event.summoner, rc);
  return [
    {
      class: "passive",
      data: { name: who, summoner: `${event.summoner}` },
      name: "summon_expired",
      text: `The summon from ${who} expired.`,
    },
  ];
}

function rule(event: RaidEvent, rc: RuleInput): AreaDraft[] {
  switch (event.type) {
    case "group_list":
      return groupList(event);
    case "invite_blocked":
      return inviteBlocked(event);
    case "member_stats":
      return memberStats(event);
    case "command_result":
      return commandResult(event);
    case "ready_check_started":
      return readyStarted(event);
    case "ready_check_answer":
      return readyAnswer(event);
    case "ready_check_finished":
      return readyFinished(event);
    case "raid_mark":
      return markRows(event, rc);
    case "raid_marks":
      return [];
    case "minimap_ping":
      return pingRows(event, rc);
    case "summon_requested":
      return summonRequested(event, rc);
    case "summon_expired":
      return summonExpired(event, rc);
    case "disbanded":
      return disbanded();
    default:
      return [];
  }
}

export const raidHarness = defineHarnessArea({
  area: "raid",
  glyph: "party",
  rules: () => ({ event: rule }),
  worldActs: [],
});
