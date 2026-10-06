import {
  isUnit,
  ObjectType,
  ROLL_VOTES,
  type RollVote,
  type WorldHandle,
} from "@peon/core";
import {
  useMeetingStone,
  useSummoningPortal,
} from "#harness/puppet/meeting-stone";

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

async function walkToObject(
  handle: WorldHandle,
  target: bigint,
): Promise<unknown> {
  for (let i = 0; i < 8; i++) {
    const row = handle.queryNearby().find((r) => r.entity.guid === target);
    if (!row?.position || row.distance === null)
      throw new Error("object is not nearby.");
    if (row.distance <= CLOSE_YARDS) return { reached: true };
    await handle.walkTowardPoint(
      row.position,
      Math.min(MAX_STEP_YARDS, row.distance - CLOSE_YARDS),
    );
  }
  const row = handle.queryNearby().find((r) => r.entity.guid === target);
  return { reached: (row?.distance ?? 999) <= CLOSE_YARDS };
}

export const PUPPET_CALLS: Readonly<Record<string, PuppetCall>> = {
  acceptGuildInvite: { args: [], run: (h) => h.acceptGuildInvite() },
  acceptInvite: { args: [], run: (h) => h.acceptInvite() },
  addFriend: { args: ["string"], run: (h, a) => h.addFriend(text(a, 0)) },
  addIgnore: { args: ["string"], run: (h, a) => h.addIgnore(text(a, 0)) },
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
  answerSummon: {
    args: [["decline", "accept"]],
    run: (h, a) => h.raid.act.answerSummon(a[0] === "accept"),
  },
  convertToRaid: { args: [], run: (h) => h.raid.act.convertToRaid() },
  declineGuildInvite: { args: [], run: (h) => h.declineGuildInvite() },
  declineInvite: { args: [], run: (h) => h.declineInvite() },
  enterPlayerVehicle: {
    args: ["guid"],
    run: (h, a) => h.vehicles.act.enterPlayerVehicle(guid(a, 0)),
  },
  exitVehicle: {
    args: [],
    run: (h) => h.vehicles.act.exitVehicle(),
  },
  finishReadyCheck: { args: [], run: (h) => h.raid.act.finishReadyCheck() },
  guildInvite: { args: ["string"], run: (h, a) => h.guildInvite(text(a, 0)) },
  invite: { args: ["string"], run: (h, a) => h.invite(text(a, 0)) },
  join: {
    args: ["number", "number"],
    run: (h, a) =>
      h.lfg.act.join({ entries: [count(a, 1)], roles: count(a, 0) }),
  },
  joinChannel: {
    args: ["string"],
    run: (h, a) => h.joinChannel(text(a, 0)),
  },
  leave: { args: [], run: (h) => h.lfg.act.leave() },
  leaveChannel: {
    args: ["string"],
    run: (h, a) => h.leaveChannel(text(a, 0)),
  },
  leaveGroup: { args: [], run: (h) => h.leaveGroup() },
  moveToSubgroup: {
    args: ["string", "number"],
    run: (h, a) => h.raid.act.moveToSubgroup(text(a, 0), count(a, 1)),
  },
  nextSeat: { args: [], run: (h) => h.vehicles.act.nextSeat() },
  pingMinimap: {
    args: ["number", "number"],
    run: (h, a) => h.raid.act.pingMinimap(count(a, 0), count(a, 1)),
  },
  prevSeat: { args: [], run: (h) => h.vehicles.act.prevSeat() },
  requestMemberStats: {
    args: ["string"],
    run: (h, a) => h.raid.act.requestMemberStats(text(a, 0)),
  },
  requestPartyLocks: { args: [], run: (h) => h.lfg.act.requestPartyLocks() },
  requestRaidMarks: {
    args: [],
    run: (h) => h.raid.act.requestRaidMarks(),
  },
  requestStatus: { args: [], run: (h) => h.lfg.act.requestStatus() },
  rollLoot: {
    args: ["guid", "number", ROLL_VOTES],
    run: (h, a) => h.rollLoot(guid(a, 0), count(a, 1), a[2] as RollVote),
  },
  selectTarget: { args: ["guid"], run: (h, a) => h.selectTarget(guid(a, 0)) },
  sendChannel: {
    args: ["string", "string"],
    run: (h, a) => h.sendChannel(text(a, 0), text(a, 1)),
  },
  sendParty: { args: ["string"], run: (h, a) => h.sendParty(text(a, 0)) },
  sendRaid: { args: ["string"], run: (h, a) => h.sendRaid(text(a, 0)) },
  sendSay: { args: ["string"], run: (h, a) => h.sendSay(text(a, 0)) },
  sendWhisper: {
    args: ["string", "string"],
    run: (h, a) => h.sendWhisper(text(a, 0), text(a, 1)),
  },
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
  setRaidMark: {
    args: ["number", "guid"],
    run: (h, a) => h.raid.act.setRaidMark(count(a, 0), guid(a, 1)),
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
  switchSeat: {
    args: ["number"],
    run: (h, a) => h.vehicles.act.switchSeat(count(a, 0)),
  },
  teleport: {
    args: [["in", "out"]],
    run: (h, a) => h.lfg.act.teleport(a[0] === "out"),
  },
  tradeAccept: {
    args: [],
    run: (h) => h.trade.act.acceptTrade(h.trade.state().theirOffer.version),
  },
  tradeAcceptOffered: {
    args: [],
    run: async (h) => {
      const offered = () => {
        const { gold, items } = h.trade.state().theirOffer;
        return gold > 0 || items.length > 0;
      };
      await tradeWaitFor(offered, "no_offer");
      return h.trade.act.acceptTrade(h.trade.state().theirOffer.version);
    },
  },
  tradeAnswer: {
    args: [["yes", "busy", "ignore"]],
    run: async (h, a) => {
      await tradeWaitFor(
        () => h.trade.state().phase === "requested_in",
        "no_request",
      );
      return h.trade.act.answerTrade(a[0] as "yes" | "busy" | "ignore");
    },
  },
  tradeCancel: { args: [], run: (h) => h.trade.act.cancelTrade() },
  tradeOffer: {
    args: ["number"],
    run: async (h, a) => {
      const entry = count(a, 0);
      const held = h
        .getInventoryState()
        .slots.find(
          (slot) =>
            slot.status === "occupied" &&
            slot.item.entry === entry &&
            (slot.region === "backpack" || slot.region === "bag_item"),
        );
      if (held?.status !== "occupied")
        throw new Error(`No carried item with entry ${entry}.`);
      await h.trade.act.offerItem(0, held.bag, held.slot);
    },
  },
  tradeRequest: {
    args: ["string"],
    run: (h, a) => h.trade.act.requestTrade(nearbyPlayer(h, text(a, 0)).guid),
  },
  tradeRequestQuiet: {
    args: ["string"],
    run: async (h, a) => {
      const outcome = await h.trade.act.requestTrade(
        nearbyPlayer(h, text(a, 0)).guid,
      );
      if (
        outcome.status === "refused" &&
        (outcome.reason === "busy" || outcome.reason === "trade_canceled")
      )
        return;
      if (outcome.status !== "ok" && outcome.status !== "unanswered")
        throw new Error(
          outcome.status === "refused"
            ? `trade_refused: ${outcome.reason}`
            : outcome.status,
        );
    },
  },
  uninvite: { args: ["string"], run: (h, a) => h.uninvite(text(a, 0)) },
  uninviteGuid: {
    args: ["string", "string"],
    run: (h, a) => h.raid.act.uninviteGuid(text(a, 0), text(a, 1)),
  },
  useMeetingStone: {
    args: ["string"],
    run: (h, a) => useMeetingStone(h, text(a, 0)),
  },
  useSummoningPortal: { args: [], run: (h) => useSummoningPortal(h) },
  voteKick: {
    args: [["no", "yes"]],
    run: (h, a) => h.lfg.act.voteKick(a[0] === "yes"),
  },
  walkToObject: {
    args: ["guid"],
    run: (h, a) => walkToObject(h, guid(a, 0)),
  },
  walkToPlayer: {
    args: ["string"],
    run: (h, a) => walkToPlayer(h, text(a, 0)),
  },
};

const TRADE_WAIT_MS = 60_000;
const TRADE_POLL_MS = 250;
const CLOSE_YARDS = 3;
const MAX_STEP_YARDS = 20;

function nearbyRow(handle: WorldHandle, name: string) {
  const wanted = name.toLowerCase();
  const found = handle
    .queryNearby()
    .find(
      (row) =>
        !row.self &&
        isUnit(row.entity) &&
        row.entity.objectType === ObjectType.PLAYER &&
        row.entity.name?.toLowerCase() === wanted,
    );
  if (!found) throw new Error(`No nearby player named ${name}.`);
  return found;
}

function nearbyPlayer(handle: WorldHandle, name: string) {
  return nearbyRow(handle, name).entity;
}

async function tradeWaitFor(
  ready: () => boolean,
  failure: string,
): Promise<void> {
  for (let waited = 0; !ready(); waited += TRADE_POLL_MS) {
    if (waited >= TRADE_WAIT_MS) throw new Error(failure);
    await new Promise<void>((resolve) => setTimeout(resolve, TRADE_POLL_MS));
  }
}

async function walkToPlayer(handle: WorldHandle, name: string): Promise<void> {
  const { distance, position } = nearbyRow(handle, name);
  if (!position || distance === null)
    throw new Error(`${name} has no known position.`);
  if (distance <= CLOSE_YARDS) return;
  await handle.walkTowardPoint(
    position,
    Math.min(MAX_STEP_YARDS, distance - CLOSE_YARDS),
  );
}

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
