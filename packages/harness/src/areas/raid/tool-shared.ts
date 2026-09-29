import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import type { AreaEventOf, AreaState, PartyMember } from "@peon/core";
import type { ToolCtx } from "#harness/contract/services";

export const groupParams = Type.Object({
  do: Type.Optional(
    StringEnum(
      [
        "status",
        "kick",
        "lead",
        "raid",
        "move",
        "swap",
        "promote",
        "loot_rules",
        "give",
        "pass_loot",
        "roll",
        "share_quest",
        "accept_quest",
        "decline_quest",
      ],
      {
        description:
          "status: show each group member. kick: remove a member by name. lead: pass the leader to a member. raid: make the group a raid. move: move a member to a subgroup. swap: swap two members between subgroups. promote: set assistant, main tank or main assist. loot_rules: set the loot method. give: give a master loot item to a member. pass_loot: pass on group loot with on or off. roll: answer the open group roll with need, greed or pass. share_quest: share a quest in your log with the group; quest takes the id or part of the title. accept_quest: take the shared quest. decline_quest: turn down the shared quest. Default status.",
      },
    ),
  ),
  group: Type.Optional(
    Type.Number({
      description: "For move: the subgroup 1-8.",
    }),
  ),
  quality: Type.Optional(
    StringEnum(["uncommon", "rare", "epic", "legendary", "artifact"], {
      description: "For loot_rules: the loot quality threshold.",
    }),
  ),
  quest: Type.Optional(
    Type.Union(
      [
        Type.Number({ description: "For share_quest: the quest id." }),
        Type.String({
          description: "For share_quest: part of the quest title.",
        }),
      ],
      {
        description: "For share_quest: the quest id or part of its title.",
      },
    ),
  ),
  target: Type.Optional(
    Type.String({
      description:
        "For give: the corpse unit id or name. Default: the nearest lootable corpse.",
    }),
  ),
  text: Type.Optional(
    Type.String({
      description:
        "For kick: the removal reason, up to 40 characters. For promote: off clears the role.",
    }),
  ),
  to: Type.Optional(
    Type.String({
      description:
        "For kick, lead, move, swap, promote and loot_rules: the member's exact name. For status: show only this member. For give: the member who receives the item; empty means yourself.",
    }),
  ),
  what: Type.Optional(
    Type.String({
      description:
        "For promote: assistant, main_tank or main_assist. For loot_rules: the loot method. For give: the item name as the loot window shows it. For pass_loot: on or off. For roll: need, greed or pass.",
    }),
  ),
  with: Type.Optional(
    Type.String({
      description:
        "For swap: the second member's exact name. For roll: the item name when two rolls are open.",
    }),
  ),
});

export type GroupArgs = Static<typeof groupParams>;
export type GroupDo =
  | "status"
  | "kick"
  | "lead"
  | "raid"
  | "move"
  | "swap"
  | "promote"
  | "loot_rules"
  | "give"
  | "pass_loot"
  | "roll"
  | "share_quest"
  | "accept_quest"
  | "decline_quest";

export type RaidState = AreaState<"raid">;
export type RaidGroup = NonNullable<RaidState["group"]>;
export type RaidEvent = AreaEventOf<"raid">;

export type GroupAfter = {
  do: GroupDo;
  to: string | undefined;
  confirmed: boolean;
  member: string | undefined;
};

export type GroupCtx = ToolCtx<GroupAfter>;

export function emptyGroup(): GroupAfter {
  return { confirmed: false, do: "status", member: undefined, to: undefined };
}

export type Answer =
  | { event: RaidEvent; kind: "raid" }
  | { name: string; kind: "group" };

export const KICK_SETTLE_MS = 3000;
export const STALE_MS = 15_000;
export const SELF_NAME = "you";
export const ASSISTANT_FLAG = 0x01;
export const MAIN_TANK_FLAG = 0x02;
export const MAIN_ASSIST_FLAG = 0x04;
export const DEAD_STATUS = 0x04;
export const GHOST_STATUS = 0x08;

export function sameName(a: string, b: string | undefined): boolean {
  return b !== undefined && a.toLowerCase() === b.toLowerCase();
}

export function findMember(
  members: readonly PartyMember[],
  name: string | undefined,
): PartyMember | undefined {
  return name === undefined
    ? undefined
    : members.find((member) => sameName(member.name, name));
}

export function isLeader(group: RaidGroup, ctx: GroupCtx): boolean {
  if (group.leader === 0n) return false;
  return group.leader === ctx.handle.getControlState().selfGuid;
}

export function isAssistant(group: RaidGroup, ctx: GroupCtx): boolean {
  const guid = ctx.handle.getControlState().selfGuid;
  const me = group.members.find((member) => member.guid === guid);
  const flags = me ? me.flags : group.self.flags;
  return Math.floor(flags / ASSISTANT_FLAG) % 2 === 1;
}

export function leaderName(group: RaidGroup): string | undefined {
  const leader = group.members.find((member) => member.guid === group.leader);
  return leader?.name;
}
