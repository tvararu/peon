import { ROLL_VOTES, type RollVote, type WorldHandle } from "@peon/core";

type ArgKind = "string" | "guid" | "number" | readonly string[];

export type PuppetCall = {
  readonly args: readonly ArgKind[];
  readonly run: (handle: WorldHandle, args: readonly unknown[]) => void;
};

const text = (args: readonly unknown[], at: number) => args[at] as string;
const guid = (args: readonly unknown[], at: number) => args[at] as bigint;
const count = (args: readonly unknown[], at: number) => args[at] as number;

export const PUPPET_CALLS: Readonly<Record<string, PuppetCall>> = {
  acceptGuildInvite: { args: [], run: (h) => h.acceptGuildInvite() },
  acceptInvite: { args: [], run: (h) => h.acceptInvite() },
  declineGuildInvite: { args: [], run: (h) => h.declineGuildInvite() },
  declineInvite: { args: [], run: (h) => h.declineInvite() },
  guildInvite: { args: ["string"], run: (h, a) => h.guildInvite(text(a, 0)) },
  invite: { args: ["string"], run: (h, a) => h.invite(text(a, 0)) },
  leaveGroup: { args: [], run: (h) => h.leaveGroup() },
  rollLoot: {
    args: ["guid", "number", ROLL_VOTES],
    run: (h, a) => h.rollLoot(guid(a, 0), count(a, 1), a[2] as RollVote),
  },
  selectTarget: { args: ["guid"], run: (h, a) => h.selectTarget(guid(a, 0)) },
  sendParty: { args: ["string"], run: (h, a) => h.sendParty(text(a, 0)) },
  sendRaid: { args: ["string"], run: (h, a) => h.sendRaid(text(a, 0)) },
  sendSay: { args: ["string"], run: (h, a) => h.sendSay(text(a, 0)) },
  setLeader: { args: ["string"], run: (h, a) => h.setLeader(text(a, 0)) },
  setPassOnLoot: {
    args: [["off", "on"]],
    run: (h, a) => h.looting.act.setPassOnLoot(a[0] === "on"),
  },
  uninvite: { args: ["string"], run: (h, a) => h.uninvite(text(a, 0)) },
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
