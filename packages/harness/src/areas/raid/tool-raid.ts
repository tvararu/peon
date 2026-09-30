import {
  needGroup,
  needRank,
  type RaidChange,
  resolveMember,
  runRaidSettled,
  type Settled,
} from "#harness/areas/raid/tool-settle";
import {
  type Answer,
  ASSISTANT_FLAG,
  emptyGroup,
  type GroupAfter,
  type GroupArgs,
  type GroupCtx,
  type GroupDo,
  isLeader,
  MAIN_ASSIST_FLAG,
  MAIN_TANK_FLAG,
  type RaidGroup,
  sameName,
} from "#harness/areas/raid/tool-shared";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { askHuman } from "#harness/tools/next-call";

function promoteSettled(
  named: Role,
  target: string,
  on: boolean,
  answer: Answer | undefined,
): Settled | undefined {
  if (
    answer?.kind === "raid" &&
    answer.event.type === "group_list" &&
    answer.event.changes.some(
      (change: RaidChange) =>
        change.kind === "flag" &&
        change.flag === named &&
        sameName(change.name ?? "", target) &&
        change.on === on,
    )
  ) {
    return {
      after: {
        ...emptyGroup(),
        confirmed: true,
        do: "promote",
        member: target,
        to: target,
      },
      detail: on
        ? `${target} holds ${named} now.`
        : `${target} no longer holds ${named}.`,
      status: "DONE",
    };
  }
}

function promoteSend(
  named: Role,
  ctx: GroupCtx,
  target: string,
  on: boolean,
): () => void {
  if (named === "assistant")
    return () => ctx.handle.raid.act.setAssistant(target, on);
  if (named === "main_tank")
    return () => ctx.handle.raid.act.setMainTank(target, on);
  return () => ctx.handle.raid.act.setMainAssist(target, on);
}

const SUBGROUP_SIZE = 5;
const MAX_SUBGROUP = 8;

const ROLE_FLAGS = {
  assistant: ASSISTANT_FLAG,
  main_assist: MAIN_ASSIST_FLAG,
  main_tank: MAIN_TANK_FLAG,
} as const;
type Role = keyof typeof ROLE_FLAGS;
const ROLES: Record<string, Role> = {
  assistant: "assistant",
  main_assist: "main_assist",
  main_tank: "main_tank",
};

function raidSettled(answer: Answer | undefined): Settled | undefined {
  if (
    answer?.kind === "raid" &&
    answer.event.type === "command_result" &&
    answer.event.result === "raid_disallowed_by_level"
  ) {
    return {
      after: { ...emptyGroup(), do: "raid" as GroupDo },
      detail: "the server refused the raid: a member is below level 10.",
      next: askHuman("The raid was refused for level. What should I do?"),
      reason: "level_too_low",
      status: "FAILED",
    };
  }
  if (
    answer?.kind === "raid" &&
    answer.event.type === "group_list" &&
    answer.event.changes.some((change) => change.kind === "converted")
  ) {
    return {
      after: { ...emptyGroup(), confirmed: true, do: "raid" as GroupDo },
      detail: "the group is a raid now.",
      status: "DONE",
    };
  }
}

export async function raidTool(
  _args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const { group, party } = needGroup(ctx);
  if (!isLeader(group, ctx)) {
    throw new Refusal({
      detail: "only the leader makes the group a raid.",
      next: "end your turn.",
      reason: "not_leader",
    });
  }
  if (group.dungeonFinder !== undefined) {
    throw new Refusal({
      detail: "the dungeon finder runs this group; it cannot become a raid.",
      next: "end your turn.",
      reason: "lfg_group",
    });
  }
  if (party.members.length === 0) {
    throw new Refusal({
      detail: "a raid needs at least two members.",
      next: "end your turn.",
      reason: "too_few_members",
    });
  }
  if (group.kind === "raid") {
    throw new Refusal({
      detail: "the group is already a raid.",
      next: "end your turn.",
      reason: "already_raid",
    });
  }
  return await runRaidSettled(
    ctx,
    () => ctx.handle.raid.act.convertToRaid(),
    raidSettled,
    {
      after: { ...emptyGroup(), do: "raid" as GroupDo },
      detail: "the raid change is not confirmed yet.",
      failedDetail: "the raid change failed.",
      next: "end your turn; a [game] message comes if the group converts.",
    },
  );
}

function moveTarget(raw: number | undefined): number | undefined {
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > MAX_SUBGROUP
  )
    return undefined;
  return raw - 1;
}

function moveSeat(
  group: RaidGroup,
  target: { guid: bigint; name: string },
  want: number,
): { after: GroupAfter; detail: string } | undefined {
  if (
    group.members.find((member) => member.guid === target.guid)?.subgroup ===
    want
  )
    return {
      after: {
        ...emptyGroup(),
        confirmed: true,
        do: "move",
        member: target.name,
        to: target.name,
      },
      detail: `${target.name} is already in group ${want + 1}.`,
    };
}

export function promoteRole(role: string | undefined): Role {
  const named = (role ?? "").trim().toLowerCase() as Role;
  if (!Object.hasOwn(ROLES, named)) {
    throw new Refusal({
      detail: "name a role: assistant, main_tank or main_assist.",
      next: "end your turn.",
      reason: "bad_role",
    });
  }
  return named;
}

function promoteHeld(
  group: RaidGroup,
  target: { guid: bigint },
  named: Role,
): boolean {
  const flags =
    group.members.find((member) => member.guid === target.guid)?.flags ?? 0;
  return Math.floor(flags / ROLE_FLAGS[named]) % 2 === 1;
}

function moveRoom(group: RaidGroup, want: number): void {
  const occupants =
    group.members.filter((member) => member.subgroup === want).length +
    (group.self.subgroup === want ? 1 : 0);
  if (occupants >= SUBGROUP_SIZE) {
    throw new Refusal({
      detail: `group ${want + 1} is full.`,
      next: "end your turn.",
      reason: "group_full",
    });
  }
}

function swapSettled(
  first: string,
  second: string,
  answer: Answer | undefined,
): Settled | undefined {
  if (
    answer?.kind === "raid" &&
    answer.event.type === "group_list" &&
    answer.event.changes.some(
      (change: RaidChange) =>
        change.kind === "subgroup" && sameName(change.name ?? "", first),
    ) &&
    answer.event.changes.some(
      (change: RaidChange) =>
        change.kind === "subgroup" && sameName(change.name ?? "", second),
    )
  ) {
    return {
      after: {
        ...emptyGroup(),
        confirmed: true,
        do: "swap",
        member: first,
        to: second,
      },
      detail: `${first} and ${second} swapped groups.`,
      status: "DONE",
    };
  }
}

function subgroupSettled(
  target: string,
  want: number,
  answer: Answer | undefined,
): Settled | undefined {
  if (
    answer?.kind === "raid" &&
    answer.event.type === "group_list" &&
    answer.event.changes.some(
      (change: RaidChange) =>
        change.kind === "subgroup" &&
        sameName(change.name ?? "", target) &&
        change.to === want,
    )
  ) {
    return {
      after: {
        ...emptyGroup(),
        confirmed: true,
        do: "move" as GroupDo,
        member: target,
        to: target,
      },
      detail: `${target} is in group ${want + 1} now.`,
      status: "DONE",
    };
  }
}

export async function moveTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const { group, party } = needGroup(ctx);
  if (group.kind !== "raid") {
    throw new Refusal({
      detail: "subgroups exist only in a raid.",
      next: "end your turn.",
      reason: "not_raid",
    });
  }
  needRank(group, ctx, true);
  const target = resolveMember(party.members, args.to);
  const want = moveTarget(args.group);
  if (want === undefined) {
    throw new Refusal({
      detail: "name a subgroup 1-8.",
      next: "end your turn.",
      reason: "bad_group",
    });
  }
  const seated = moveSeat(group, target, want);
  if (seated) return result("DONE", seated);
  moveRoom(group, want);
  return await runRaidSettled(
    ctx,
    () => ctx.handle.raid.act.moveToSubgroup(target.name, want + 1),
    (answer) => subgroupSettled(target.name, want, answer),
    {
      after: {
        ...emptyGroup(),
        do: "move" as GroupDo,
        member: target.name,
        to: target.name,
      },
      detail: `the move of ${target.name} is not confirmed yet.`,
      failedDetail: `the move of ${target.name} failed.`,
      next: `end your turn; a [game] message comes if ${target.name} moves.`,
    },
  );
}

export async function swapTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const { group, party } = needGroup(ctx);
  if (group.kind !== "raid") {
    throw new Refusal({
      detail: "subgroups exist only in a raid.",
      next: "end your turn.",
      reason: "not_raid",
    });
  }
  needRank(group, ctx, true);
  const first = resolveMember(party.members, args.to);
  const secondName = args.with?.trim();
  if (!secondName || sameName(secondName, first.name)) {
    throw new Refusal({
      detail: "name two different group members.",
      next: "end your turn.",
      reason: "needs_name",
    });
  }
  const second = resolveMember(party.members, secondName);
  return await runRaidSettled(
    ctx,
    () => ctx.handle.raid.act.swapSubgroups(first.name, second.name),
    (answer) => swapSettled(first.name, second.name, answer),
    {
      after: {
        ...emptyGroup(),
        do: "swap" as GroupDo,
        member: first.name,
        to: second.name,
      },
      detail: `the swap of ${first.name} is not confirmed yet.`,
      failedDetail: `the swap of ${first.name} failed.`,
      next: `end your turn; a [game] message comes if ${first.name} swaps.`,
    },
  );
}

export async function promoteTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const { group, party } = needGroup(ctx);
  const named = promoteRole(args.what);
  needRank(group, ctx, named !== "assistant");
  const target = resolveMember(party.members, args.to);
  const on = (args.text ?? "on").trim().toLowerCase() !== "off";
  if (promoteHeld(group, target, named) === on) {
    return result("DONE", {
      after: {
        ...emptyGroup(),
        confirmed: true,
        do: "promote" as GroupDo,
        member: target.name,
        to: target.name,
      },
      detail: on
        ? `${target.name} already holds ${named}.`
        : `${target.name} no longer holds ${named}.`,
    });
  }
  const send = promoteSend(named, ctx, target.name, on);
  return await runRaidSettled(
    ctx,
    send,
    (answer) => promoteSettled(named, target.name, on, answer),
    {
      after: {
        ...emptyGroup(),
        do: "promote" as GroupDo,
        member: target.name,
        to: target.name,
      },
      detail: `the promotion of ${target.name} is not confirmed yet.`,
      failedDetail: `the promotion of ${target.name} failed.`,
      next: `end your turn; a [game] message comes if ${target.name} is promoted.`,
    },
  );
}
