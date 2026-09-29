import { ROLL_VOTES, type RollVote, type WorldHandle } from "@peon/core";

type ArgKind = "string" | "guid" | "number" | readonly string[];

export type PuppetCall = {
  readonly args: readonly ArgKind[];
  readonly run: (
    handle: WorldHandle,
    args: readonly unknown[],
  ) => unknown | Promise<unknown>;
};

const text = (args: readonly unknown[], at: number) => args[at] as string;
const guid = (args: readonly unknown[], at: number) => args[at] as bigint;
const count = (args: readonly unknown[], at: number) => args[at] as number;

export const PUPPET_CALLS: Readonly<Record<string, PuppetCall>> = {
  acceptGuildInvite: { args: [], run: (h) => h.acceptGuildInvite() },
  acceptInvite: { args: [], run: (h) => h.acceptInvite() },
  answerProposal: {
    args: [["decline", "accept"]],
    run: (h, a) => h.lfg.act.answerProposal(a[0] === "accept"),
  },
  answerReadyCheck: {
    args: [["no", "yes"]],
    run: (h, a) => h.raid.act.answerReadyCheck(a[0] === "yes"),
  },
  answerShare: {
    args: [["accept", "decline"]],
    run: (h, a) => {
      if (!h.quests.act.answerShare(a[0] as "accept" | "decline"))
        throw new Error("No shared quest is offered.");
    },
  },
  convertToRaid: { args: [], run: (h) => h.raid.act.convertToRaid() },
  declineGuildInvite: { args: [], run: (h) => h.declineGuildInvite() },
  declineInvite: { args: [], run: (h) => h.declineInvite() },
  finishReadyCheck: { args: [], run: (h) => h.raid.act.finishReadyCheck() },
  guildInvite: { args: ["string"], run: (h, a) => h.guildInvite(text(a, 0)) },
  invite: { args: ["string"], run: (h, a) => h.invite(text(a, 0)) },
  join: {
    args: ["number", "number"],
    run: (h, a) =>
      h.lfg.act.join({ entries: [count(a, 1)], roles: count(a, 0) }),
  },
  leave: { args: [], run: (h) => h.lfg.act.leave() },
  leaveGroup: { args: [], run: (h) => h.leaveGroup() },
  moveToSubgroup: {
    args: ["string", "number"],
    run: (h, a) => h.raid.act.moveToSubgroup(text(a, 0), count(a, 1)),
  },
  requestMemberStats: {
    args: ["string"],
    run: (h, a) => h.raid.act.requestMemberStats(text(a, 0)),
  },
  requestPartyLocks: { args: [], run: (h) => h.lfg.act.requestPartyLocks() },
  requestStatus: { args: [], run: (h) => h.lfg.act.requestStatus() },
  rollLoot: {
    args: ["guid", "number", ROLL_VOTES],
    run: (h, a) => h.rollLoot(guid(a, 0), count(a, 1), a[2] as RollVote),
  },
  selectTarget: { args: ["guid"], run: (h, a) => h.selectTarget(guid(a, 0)) },
  sendParty: { args: ["string"], run: (h, a) => h.sendParty(text(a, 0)) },
  sendRaid: { args: ["string"], run: (h, a) => h.sendRaid(text(a, 0)) },
  sendSay: { args: ["string"], run: (h, a) => h.sendSay(text(a, 0)) },
  setAssistant: {
    args: ["string", ["off", "on"]],
    run: (h, a) => h.raid.act.setAssistant(text(a, 0), a[1] === "on"),
  },
  setLeader: { args: ["string"], run: (h, a) => h.setLeader(text(a, 0)) },
  setLootMethod: {
    args: [
      [
        "free_for_all",
        "round_robin",
        "master_loot",
        "group_loot",
        "need_before_greed",
      ] satisfies Parameters<
        WorldHandle["looting"]["act"]["setLootMethod"]
      >[0]["method"][],
      [
        "uncommon",
        "rare",
        "epic",
        "legendary",
        "artifact",
      ] satisfies Parameters<
        WorldHandle["looting"]["act"]["setLootMethod"]
      >[0]["threshold"][],
      "string",
    ],
    run: (h, a) =>
      h.looting.act.setLootMethod({
        master: text(a, 2),
        method: a[0] as never,
        threshold: a[1] as never,
      }),
  },
  setMainAssist: {
    args: ["string", ["off", "on"]],
    run: (h, a) => h.raid.act.setMainAssist(text(a, 0), a[1] === "on"),
  },
  setMainTank: {
    args: ["string", ["off", "on"]],
    run: (h, a) => h.raid.act.setMainTank(text(a, 0), a[1] === "on"),
  },
  setPassOnLoot: {
    args: [["off", "on"]],
    run: (h, a) => h.looting.act.setPassOnLoot(a[0] === "on"),
  },
  setRoles: {
    args: ["number"],
    run: (h, a) => h.lfg.act.setRoles(count(a, 0)),
  },
  shareQuest: {
    args: ["number"],
    run: (h, a) => {
      const shared = h.quests.act.shareQuest(count(a, 0));
      if (!shared.ok) throw new Error(`Quest not shared: ${shared.reason}.`);
    },
  },
  startReadyCheck: { args: [], run: (h) => h.raid.act.startReadyCheck() },
  swapSubgroups: {
    args: ["string", "string"],
    run: (h, a) => h.raid.act.swapSubgroups(text(a, 0), text(a, 1)),
  },
  teleport: {
    args: [["in", "out"]],
    run: (h, a) => h.lfg.act.teleport(a[0] === "out"),
  },
  uninvite: { args: ["string"], run: (h, a) => h.uninvite(text(a, 0)) },
  uninviteGuid: {
    args: ["string", "string"],
    run: (h, a) => h.raid.act.uninviteGuid(text(a, 0), text(a, 1)),
  },
  voteKick: {
    args: [["no", "yes"]],
    run: (h, a) => h.lfg.act.voteKick(a[0] === "yes"),
  },
};

const GUID = /^\d+$/;
const GUID_MAX = 2n ** 64n - 1n;

export function decodeCall(
  method: string,
  json: string | undefined,
): { method: string; args: unknown[] } | { error: string } {
  const call = Object.hasOwn(PUPPET_CALLS, method)
    ? PUPPET_CALLS[method]
    : undefined;
  if (call === undefined) return { error: `Unknown call: ${method}` };
  const raw = parseArray(json);
  if (raw === undefined)
    return { error: `${method} takes a JSON array of arguments.` };
  if (raw.length !== call.args.length)
    return {
      error: `${method} takes ${call.args.length} argument(s), got ${raw.length}.`,
    };
  const args: unknown[] = [];
  for (const [at, kind] of call.args.entries()) {
    const value = decodeArg(kind, raw[at]);
    if (value === undefined)
      return {
        error: `${method} argument ${at + 1} must be ${describe(kind)}.`,
      };
    args.push(value);
  }
  return { args, method };
}

function parseArray(json: string | undefined): unknown[] | undefined {
  if (json === undefined) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function decodeArg(kind: ArgKind, value: unknown): unknown {
  if (kind === "string") return typeof value === "string" ? value : undefined;
  if (kind === "number") return Number.isInteger(value) ? value : undefined;
  if (kind === "guid") {
    if (typeof value !== "string" || !GUID.test(value)) return undefined;
    const big = BigInt(value);
    return big <= GUID_MAX ? big : undefined;
  }
  return typeof value === "string" && kind.includes(value) ? value : undefined;
}

function describe(kind: ArgKind): string {
  if (kind === "string") return "a string";
  if (kind === "number") return "an integer";
  if (kind === "guid") return "a decimal guid string";
  return `one of ${kind.join(", ")}`;
}
