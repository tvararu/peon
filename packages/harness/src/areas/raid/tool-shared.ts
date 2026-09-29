import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import type { AreaEventOf, AreaState, PartyMember } from "@peon/core";
import type { ToolCtx } from "#harness/contract/services";

export const groupParams = Type.Object({
  do: Type.Optional(
    StringEnum(["status", "kick", "lead"], {
      description:
        "status: show each group member. kick: remove a member by name. lead: pass the leader to a member. Default status.",
    }),
  ),
  text: Type.Optional(
    Type.String({
      description: "For kick: the removal reason, up to 40 characters.",
    }),
  ),
  to: Type.Optional(
    Type.String({
      description:
        "For kick and lead: the member's exact name. For status: show only this member.",
    }),
  ),
});

export type GroupArgs = Static<typeof groupParams>;
export type GroupDo = "status" | "kick" | "lead";

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
