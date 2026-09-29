import type { AreaRuntimeCtx } from "#wow/areas/contract";
import type { RaidGroup } from "#wow/areas/raid/protocol";
import type {
  RaidChange,
  RaidEvent,
  RaidState,
} from "#wow/areas/raid/store-roster";
import type { MemberStats } from "#wow/areas/raid/store-stats";
import { buildRequestPartyMemberStats } from "#wow/protocol/group-stats";
import { GameOpcode } from "#wow/protocol/opcodes";

export const STATS_FRESH_MS = 30_000;
export const STATS_REQUEST_GAP_MS = 10_000;

export type StatsActs = {
  memberStats: (name: string) => MemberStats | undefined;
  requestMemberStats: (name: string) => void;
};

type StatsCtx = AreaRuntimeCtx<RaidEvent>;
type StatsStore = {
  snapshot: () => RaidState;
  onEvent: (cb: (event: RaidEvent) => void) => unknown;
};

type Env = { ctx: StatsCtx; store: StatsStore };

function guidsByName(
  group: RaidGroup | undefined,
): ReadonlyMap<string, bigint> {
  const guids = new Map<string, bigint>();
  for (const member of group?.members ?? [])
    guids.set(member.name, member.guid);
  return guids;
}

function joinedNames(changes: readonly RaidChange[]): readonly string[] {
  const names: string[] = [];
  for (const change of changes)
    if (change.kind === "joined") names.push(change.name);
  return names;
}

function makeRequester(env: Env) {
  const lastSent = new Map<bigint, number>();
  function sendAt(guid: bigint, now: number): void {
    env.ctx.send(
      GameOpcode.CMSG_REQUEST_PARTY_MEMBER_STATS,
      buildRequestPartyMemberStats(guid),
    );
    lastSent.set(guid, now);
  }
  function request(guid: bigint): void {
    sendAt(guid, env.ctx.now());
  }
  function requestStale(guid: bigint, stats: MemberStats | undefined): void {
    const now = env.ctx.now();
    const age =
      stats === undefined ? Number.POSITIVE_INFINITY : now - stats.seenAt;
    if (age < STATS_FRESH_MS) return;
    const last = lastSent.get(guid);
    if (last !== undefined && now - last < STATS_REQUEST_GAP_MS) return;
    sendAt(guid, now);
  }
  function lookup(name: string): bigint {
    const guid = guidsByName(env.store.snapshot().group).get(name);
    if (guid === undefined) throw new Error(`unknown group member ${name}`);
    return guid;
  }
  function track(event: RaidEvent): void {
    if (event.type !== "group_list") return;
    for (const name of joinedNames(event.changes)) {
      const guid = guidsByName(event.group).get(name);
      if (guid !== undefined) request(guid);
    }
  }
  function memberStats(name: string): MemberStats | undefined {
    const guid = guidsByName(env.store.snapshot().group).get(name);
    if (guid === undefined) return undefined;
    const stats = env.store.snapshot().stats.get(guid);
    requestStale(guid, stats);
    return stats;
  }
  function requestMemberStats(name: string): void {
    request(lookup(name));
  }
  return {
    dispose: () => lastSent.clear(),
    memberStats,
    requestMemberStats,
    track,
  };
}

export function composeStatsRuntime(env: Env): {
  act: StatsActs;
  dispose: () => void;
} {
  const requester = makeRequester(env);
  const off = env.store.onEvent(requester.track);
  return {
    act: {
      memberStats: requester.memberStats,
      requestMemberStats: requester.requestMemberStats,
    },
    dispose: () => {
      if (typeof off === "function") off();
      requester.dispose();
    },
  };
}
