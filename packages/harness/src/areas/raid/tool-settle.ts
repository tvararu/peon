import type { PartyMember, WorldHandle } from "@peon/core";
import {
  type Answer,
  findMember,
  type GroupAfter,
  type GroupCtx,
  isAssistant,
  isLeader,
  KICK_SETTLE_MS,
  type RaidEvent,
  type RaidGroup,
} from "#harness/areas/raid/tool-shared";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { result } from "#harness/tools/define";
import { askHuman, nextCall } from "#harness/tools/next-call";

export type LootMethodChoice = Parameters<
  WorldHandle["looting"]["act"]["setLootMethod"]
>[0];
export type LootMethod = LootMethodChoice["method"];
export type LootThreshold = LootMethodChoice["threshold"];

export type Settled = {
  status: "DONE" | "FAILED";
  after: GroupAfter;
  detail: string;
  next?: string;
  reason?: string;
};

export type RaidChange = Extract<
  RaidEvent,
  { type: "group_list" }
>["changes"][number];

export function needGroup(ctx: GroupCtx): {
  group: RaidGroup;
  party: ReturnType<GroupCtx["handle"]["getPartyState"]>;
} {
  const party = ctx.handle.getPartyState();
  const group = ctx.handle.raid.state().group;
  if (!(party.inGroup && group)) {
    throw new Refusal({
      detail: "you are not in a group.",
      next: askHuman("I am not in a group. What should I do?"),
      reason: "not_in_group",
    });
  }
  return { group, party };
}

export function resolveMember(
  members: readonly PartyMember[],
  to: string | undefined,
): { guid: bigint; name: string } {
  const name = to?.trim();
  if (!name) {
    throw new Refusal({
      detail: "name the group member.",
      next: "end your turn.",
      reason: "needs_name",
    });
  }
  const member = findMember(members, name);
  if (!member) {
    throw new Refusal({
      detail: `${name} is not in your group. Members: ${members.map((entry) => entry.name).join(", ")}.`,
      next: "end your turn.",
      reason: "not_a_member",
    });
  }
  return { guid: member.guid, name: member.name };
}

export function needRank(
  group: RaidGroup,
  ctx: GroupCtx,
  assistantOk: boolean,
): void {
  if (isLeader(group, ctx)) return;
  if (assistantOk && isAssistant(group, ctx)) return;
  throw new Refusal({
    detail: "only the leader passes this order.",
    next: "end your turn.",
    reason: "not_leader",
  });
}

export async function runRaidSettled(
  ctx: GroupCtx,
  send: () => void,
  match: (answer: Answer | undefined) => Settled | undefined,
  unconfirmed: {
    after: GroupAfter;
    detail: string;
    failedDetail: string;
    next: string;
  },
): Promise<ToolResult<GroupAfter>> {
  let answer: Answer | undefined;
  try {
    answer = await settle<Answer>({
      match: (candidate) => match(candidate) !== undefined,
      send: () => ctx.rt.mutex.run(() => send()),
      signal: ctx.signal,
      subscribe: (cb) =>
        ctx.handle.raid.onEvent((event) => cb({ event, kind: "raid" })),
      timeoutMs: KICK_SETTLE_MS,
    });
  } catch (error) {
    if (ctx.signal?.aborted) throw error;
    throw error instanceof Refusal
      ? error
      : new Refusal({
          detail: unconfirmed.failedDetail,
          next: nextCall("look"),
          reason: "error",
          status: "FAILED",
        });
  }
  const outcome = match(answer);
  if (outcome) return { ...outcome, body: [] };
  return result("UNCONFIRMED", {
    after: unconfirmed.after,
    detail: unconfirmed.detail,
    next: unconfirmed.next,
    reason: "no_answer",
  });
}
