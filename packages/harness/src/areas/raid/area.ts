import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

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
    if (change.kind === "joined" || change.kind === "left") continue;
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

function rule(event: RaidEvent): AreaDraft[] {
  switch (event.type) {
    case "group_list":
      return groupList(event);
    case "invite_blocked":
      return inviteBlocked(event);
    case "member_stats":
      return memberStats(event);
    case "command_result":
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
      return [
        {
          class: "passive",
          data: {},
          name: "roster",
          text: "The group disbanded.",
        },
      ];
    default:
      return [];
  }
}

export const raidHarness = defineHarnessArea({
  area: "raid",
  rules: () => ({ event: rule }),
  worldActs: [],
});
