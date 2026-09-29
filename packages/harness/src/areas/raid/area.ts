import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

type RaidEvent = AreaEventOf<"raid">;
type Of<T extends RaidEvent["type"]> = Extract<RaidEvent, { type: T }>;

function rosterText(kind: string, name: string | undefined): string {
  switch (kind) {
    case "converted":
      return "The group changed shape.";
    case "subgroup":
      return `${name ?? "Someone"} moved groups.`;
    case "flag":
      return `${name ?? "Someone"} gained a raid flag.`;
    case "loot":
      return "The loot rules changed.";
    case "difficulty":
      return "The difficulty changed.";
    case "leader":
      return `${name ?? "Someone"} leads the group now.`;
    case "disbanded":
      return "The group disbanded.";
    default:
      return "The roster changed.";
  }
}

function groupList(event: Of<"group_list">): AreaDraft[] {
  const rows: AreaDraft[] = [];
  for (const change of event.changes) {
    if (change.kind === "joined" || change.kind === "left") continue;
    const name = "name" in change ? change.name : undefined;
    rows.push({
      class: "passive",
      data: { change: change.kind, ...(name ? { name } : {}) },
      name: "roster",
      text: rosterText(change.kind, name),
    });
  }
  return rows;
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

function rule(event: RaidEvent): AreaDraft[] {
  switch (event.type) {
    case "group_list":
      return groupList(event);
    case "invite_blocked":
      return inviteBlocked(event);
    case "disbanded":
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
