import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import type { AreaEventOf, AreaState, PartyMember } from "@peon/core";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { askHuman, nextCall } from "#harness/tools/next-call";
import { argText } from "#harness/ui/draw";
import {
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

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

type RaidState = AreaState<"raid">;
type RaidGroup = NonNullable<RaidState["group"]>;
type RaidEvent = AreaEventOf<"raid">;

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

type Answer =
  | { event: RaidEvent; kind: "raid" }
  | { name: string; kind: "group" };

const KICK_SETTLE_MS = 3000;
const STALE_MS = 15_000;
const SELF_NAME = "you";
const ASSISTANT_FLAG = 0x01;
const MAIN_TANK_FLAG = 0x02;
const MAIN_ASSIST_FLAG = 0x04;
const DEAD_STATUS = 0x04;
const GHOST_STATUS = 0x08;

function sameName(a: string, b: string | undefined): boolean {
  return b !== undefined && a.toLowerCase() === b.toLowerCase();
}

function findMember(
  members: readonly PartyMember[],
  name: string | undefined,
): PartyMember | undefined {
  return name === undefined
    ? undefined
    : members.find((member) => sameName(member.name, name));
}

function selfGuid(ctx: GroupCtx): bigint {
  return ctx.handle.getControlState().selfGuid;
}

function isLeader(group: RaidGroup, ctx: GroupCtx): boolean {
  if (group.leader === 0n) return false;
  return group.leader === selfGuid(ctx);
}

function assistantFlags(group: RaidGroup, ctx: GroupCtx): number {
  const guid = selfGuid(ctx);
  const me = group.members.find((member) => member.guid === guid);
  return me ? me.flags : group.self.flags;
}

function isAssistant(group: RaidGroup, ctx: GroupCtx): boolean {
  return Math.floor(assistantFlags(group, ctx) / ASSISTANT_FLAG) % 2 === 1;
}

function leaderName(group: RaidGroup): string | undefined {
  const leader = group.members.find((member) => member.guid === group.leader);
  return leader?.name;
}

const POWER_KINDS: Record<number, string> = {
  0: "mana",
  1: "rage",
  2: "focus",
  3: "energy",
  6: "runic power",
};

function powerName(type: number | null): string {
  if (type === null) return "power";
  return POWER_KINDS[type] ?? "power";
}

function vitalsText(member: PartyMember): string | undefined {
  const hp =
    member.health !== null && member.maxHealth !== null
      ? `HP ${member.health}/${member.maxHealth}`
      : undefined;
  const power =
    member.power !== null && member.maxPower !== null
      ? `${powerName(member.powerType)} ${member.power}/${member.maxPower}`
      : undefined;
  const parts = [hp, power].filter((part) => part !== undefined);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

type StaleState = { stats: RaidState["stats"]; now: number };

function staleText(member: PartyMember, state: StaleState): string | undefined {
  if (member.source === "unit") return undefined;
  if (member.statsAt === null) return undefined;
  const ageMs = state.now - member.statsAt;
  if (ageMs < STALE_MS) return undefined;
  return `last seen ${Math.floor(ageMs / 1000)} s ago`;
}

type MemberVitals = { dead: boolean; ghost: boolean };

function lifeText(
  member: PartyMember,
  stats: MemberVitals | undefined,
): string {
  if (stats) {
    if (stats.ghost) return "ghost";
    if (stats.dead) return "dead";
    return "alive";
  }
  if (!member.online) return "offline";
  if (Math.floor(member.status / GHOST_STATUS) % 2 === 1) return "ghost";
  if (Math.floor(member.status / DEAD_STATUS) % 2 === 1) return "dead";
  return "alive";
}

function memberRow(member: PartyMember, state: StaleState): string {
  const parts = [member.name, `group ${member.subgroup + 1}`];
  if (Math.floor(member.flags / ASSISTANT_FLAG) % 2 === 1)
    parts.push("assistant");
  if (Math.floor(member.flags / MAIN_TANK_FLAG) % 2 === 1)
    parts.push("main tank");
  if (Math.floor(member.flags / MAIN_ASSIST_FLAG) % 2 === 1)
    parts.push("main assist");
  const vitals = vitalsText(member);
  if (vitals) parts.push(vitals);
  parts.push(lifeText(member, state.stats.get(member.guid)));
  const stale = staleText(member, state);
  if (stale) parts.push(stale);
  return `- ${parts.join(", ")}.`;
}

function statusTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const party = ctx.handle.getPartyState();
  const raid = ctx.handle.raid.state();
  const group = raid.group;
  if (!(party.inGroup && group)) {
    return Promise.resolve(
      result("DONE", {
        after: { ...emptyGroup(), do: "status" as GroupDo },
        detail: "You are not in a group.",
      }),
    );
  }
  const names = selectedNames(party.members, group.members, args.to);
  const now = ctx.rt.clock.now();
  const snapshots: RaidState["stats"] = new Map(raid.stats);
  const rows = party.members
    .filter((member) => names.has(member.name))
    .map((member) => memberRow(member, { now, stats: snapshots }));
  return Promise.resolve(
    result("DONE", {
      after: { ...emptyGroup(), do: "status" as GroupDo },
      body: rows,
      detail: leadText(group, party.members.length, ctx),
    }),
  );
}

function selectedNames(
  partyMembers: readonly PartyMember[],
  raidMembers: RaidGroup["members"],
  to: string | undefined,
): Set<string> {
  const names = new Set(partyMembers.map((member) => member.name));
  for (const member of raidMembers) names.add(member.name);
  const filter = to?.trim();
  if (!filter) return names;
  const partyHit = findMember(partyMembers, filter);
  if (partyHit) return new Set([partyHit.name]);
  const raidHit = raidMembers.find((member) => sameName(member.name, filter));
  if (!raidHit) {
    throw new Refusal({
      detail: `${filter} is not in your group. Members: ${[...names].join(", ")}.`,
      next: "end your turn.",
      reason: "not_a_member",
    });
  }
  return new Set([raidHit.name]);
}

function leadText(group: RaidGroup, size: number, ctx: GroupCtx): string {
  if (group.leader === 0n) return "No one leads the group.";
  if (isLeader(group, ctx)) return `You lead the ${group.kind} of ${size}.`;
  const peer = leaderName(group) ?? SELF_NAME;
  const assist = isAssistant(group, ctx) ? "; you assist" : "";
  return `${peer} leads the ${group.kind} of ${size}${assist}.`;
}

function subscribeKick(ctx: GroupCtx, cb: (answer: Answer) => void) {
  const offRaid = ctx.handle.raid.onEvent((event) =>
    cb({ event, kind: "raid" }),
  );
  const offGroup = ctx.handle.onGroupEvent((event) => {
    if (event.type === "leader_changed")
      cb({ kind: "group", name: event.name });
  });
  return () => {
    offRaid();
    offGroup();
  };
}

function kickSettled(target: string, answer: Answer | undefined) {
  if (
    answer?.kind === "raid" &&
    answer.event.type === "group_list" &&
    answer.event.changes.some(
      (change) => change.kind === "left" && sameName(change.name, target),
    )
  ) {
    return {
      after: {
        ...emptyGroup(),
        confirmed: true,
        do: "kick" as GroupDo,
        member: target,
        to: target,
      },
      detail: `removed ${target} from the group.`,
      status: "DONE" as const,
    };
  }
  if (answer?.kind === "raid" && answer.event.type === "disbanded") {
    return {
      after: {
        ...emptyGroup(),
        confirmed: true,
        do: "kick" as GroupDo,
        member: target,
        to: target,
      },
      detail: `removed ${target}; the group disbanded.`,
      status: "DONE" as const,
    };
  }
  if (
    answer?.kind === "raid" &&
    answer.event.type === "command_result" &&
    answer.event.operation === "uninvite" &&
    answer.event.result !== "ok"
  ) {
    return {
      after: { ...emptyGroup(), do: "kick" as GroupDo, to: target },
      detail: `the server refused the kick of ${target}.`,
      next: askHuman(`The kick of ${target} failed. What should I do?`),
      reason: answer.event.result,
      status: "FAILED" as const,
    };
  }
}

async function kickTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const party = ctx.handle.getPartyState();
  const group = ctx.handle.raid.state().group;
  if (!group) {
    throw new Refusal({
      detail: "you are not in a group.",
      next: askHuman("I am not in a group. What should I do?"),
      reason: "not_in_group",
    });
  }
  const resolved = resolveKickTarget(
    group,
    { inGroup: party.inGroup, members: party.members },
    args.to,
    ctx,
  );
  const reason = (args.text ?? "").slice(0, 40);
  let answer: Answer | undefined;
  try {
    answer = await settle<Answer>({
      match: (candidate) =>
        kickSettled(resolved.target, candidate) !== undefined,
      send: () =>
        ctx.rt.mutex.run(() =>
          ctx.handle.raid.act.uninviteGuid(resolved.target, reason),
        ),
      signal: ctx.signal,
      subscribe: (cb) => subscribeKick(ctx, cb),
      timeoutMs: KICK_SETTLE_MS,
    });
  } catch (error) {
    if (ctx.signal?.aborted) throw error;
    throw error instanceof Refusal
      ? error
      : new Refusal({
          detail: `the kick of ${resolved.target} failed.`,
          next: nextCall("look"),
          reason: "error",
          status: "FAILED",
        });
  }
  const outcome = kickSettled(resolved.target, answer);
  if (outcome) return { ...outcome, body: [] };
  return result("UNCONFIRMED", {
    after: { ...emptyGroup(), do: "kick" as GroupDo, to: resolved.target },
    detail: `removed ${resolved.target} is not confirmed yet.`,
    next: `end your turn; a [game] message comes if ${resolved.target} leaves.`,
    reason: "no_answer",
  });
}

function resolveKickTarget(
  group: RaidGroup,
  party: { inGroup: boolean; members: readonly PartyMember[] },
  to: string | undefined,
  ctx: GroupCtx,
): { target: string } {
  if (!party.inGroup) {
    throw new Refusal({
      detail: "you are not in a group.",
      next: askHuman("I am not in a group. What should I do?"),
      reason: "not_in_group",
    });
  }
  const name = to?.trim();
  if (!name) {
    throw new Refusal({
      detail: "name the group member to remove.",
      next: "end your turn.",
      reason: "needs_name",
    });
  }
  const member = findMember(party.members, name);
  if (!member) {
    throw new Refusal({
      detail: `${name} is not in your group. Members: ${party.members.map((entry) => entry.name).join(", ")}.`,
      next: "end your turn.",
      reason: "not_a_member",
    });
  }
  if (group.dungeonFinder !== undefined) {
    throw new Refusal({
      detail: "the dungeon finder runs this group's votes.",
      next: "end your turn.",
      reason: "lfg_vote_kick",
    });
  }
  if (!(isLeader(group, ctx) || isAssistant(group, ctx))) {
    throw new Refusal({
      detail: "only the leader or an assistant removes members.",
      next: "end your turn.",
      reason: "not_leader",
    });
  }
  if (member.guid === group.leader) {
    throw new Refusal({
      detail: `${member.name} leads the group; pass the lead first.`,
      next: "end your turn.",
      reason: "target_is_leader",
    });
  }
  return { target: member.name };
}

function subscribeLead(ctx: GroupCtx, cb: (answer: Answer) => void) {
  return ctx.handle.onGroupEvent((event) => {
    if (event.type === "leader_changed")
      cb({ kind: "group", name: event.name });
  });
}

async function leadTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const party = ctx.handle.getPartyState();
  const group = ctx.handle.raid.state().group;
  if (!(party.inGroup && group)) {
    throw new Refusal({
      detail: "you are not in a group.",
      next: askHuman("I am not in a group. What should I do?"),
      reason: "not_in_group",
    });
  }
  const name = args.to?.trim();
  if (!name) {
    throw new Refusal({
      detail: "name the group member to lead.",
      next: "end your turn.",
      reason: "needs_name",
    });
  }
  const member = findMember(party.members, name);
  if (!member) {
    throw new Refusal({
      detail: `${name} is not in your group. Members: ${party.members.map((entry) => entry.name).join(", ")}.`,
      next: "end your turn.",
      reason: "not_a_member",
    });
  }
  if (!isLeader(group, ctx)) {
    throw new Refusal({
      detail: "only the leader passes the lead.",
      next: "end your turn.",
      reason: "not_leader",
    });
  }
  const target = member.name;
  const answer = await settle<Answer>({
    match: (candidate) =>
      candidate.kind === "group" && sameName(candidate.name, target),
    send: () => ctx.rt.mutex.run(() => ctx.handle.setLeader(target)),
    signal: ctx.signal,
    subscribe: (cb) => subscribeLead(ctx, cb),
    timeoutMs: KICK_SETTLE_MS,
  });
  if (answer?.kind === "group") {
    return result("DONE", {
      after: {
        ...emptyGroup(),
        confirmed: true,
        do: "lead" as GroupDo,
        member: target,
        to: target,
      },
      detail: `${target} leads the group now.`,
    });
  }
  return result("UNCONFIRMED", {
    after: { ...emptyGroup(), do: "lead" as GroupDo, to: target },
    detail: `the lead of ${target} is not confirmed yet.`,
    next: `end your turn; a [game] message comes if ${target} leads.`,
    reason: "no_answer",
  });
}

function groupRun(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const ops: Record<GroupDo, string> = {
    kick: "kick",
    lead: "lead",
    status: "status",
  };
  const op =
    ops[
      (["status", "kick", "lead"] as const).find(
        (known) => known === args.do,
      ) ?? "status"
    ];
  if (op === "kick") return kickTool(args, ctx);
  if (op === "lead") return leadTool(args, ctx);
  return statusTool(args, ctx);
}

function groupCall(args: unknown, theme: CallInit["theme"]): string {
  const doing = argText(args, "do") ?? "status";
  return callLine({
    icon: "party",
    parts: [doing, argText(args, "to"), argText(args, "text")],
    theme,
    verb: "group",
  });
}

function groupBody({
  after,
  expanded,
}: {
  after: GroupAfter;
  expanded: boolean;
}): string[] {
  if (!expanded) return [];
  return after.member ? [after.member] : [];
}

export const groupRenderers: ToolRenderers<"group", GroupAfter> = {
  renderCall: callRenderer(groupCall),
  renderResult: resultRenderer("group", groupBody),
};

export const groupSpec: GameToolSpec<typeof groupParams, "group", GroupAfter> =
  {
    fallback: emptyGroup,
    kind: "action",
    maxLines: 24,
    minimalArgs: {},
    name: "group",
    parameters: groupParams,
    renderers: groupRenderers,
    run: groupRun,
    text: {
      description:
        "Shows the group roster, removes a member, or passes the lead. Status lists each member's subgroup, role, health and state. Kick and lead act only when Peon leads or assists, never in a dungeon-finder group, and kick needs a reason.",
      guidelines: ["Call status first to learn the exact member name."],
      label: "Group",
    },
  };

export const groupTool = defineGameTool(groupSpec);
