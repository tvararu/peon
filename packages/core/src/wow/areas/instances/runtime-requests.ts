import type { Unsubscribe } from "#lib/emitter";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildResetInstances,
  buildSetDungeonDifficulty,
  buildSetRaidDifficulty,
} from "#wow/areas/instances/protocol";
import type { InstancesOutcome } from "#wow/areas/instances/runtime";
import type {
  DifficultyBody,
  InstancesEvent,
  InstancesStore,
} from "#wow/areas/instances/store";
import type { PartyState } from "#wow/party-store";
import type { DifficultyKind } from "#wow/protocol/difficulty";
import { GameOpcode } from "#wow/protocol/opcodes";

export const DIFFICULTY_ECHO_MS = 2000;
export const RESET_WINDOW_MS = 2000;

export type DifficultyRequest = { kind: DifficultyKind; value: number };

type Ctx = AreaRuntimeCtx<InstancesEvent>;

const MODE_LIMIT = { dungeon: 3, raid: 4 } as const;
const HEROIC_OR_HIGHER_DUNGEON = 1;

type Window<T> = {
  windowMs: number;
  done: (items: readonly T[]) => boolean;
};

function gather<T>(
  ctx: Ctx,
  subscribe: (cb: (item: T) => void) => Unsubscribe,
  send: () => void,
  { windowMs, done }: Window<T>,
): Promise<readonly T[]> {
  return new Promise((resolve, reject) => {
    if (ctx.signal.aborted) return reject(ctx.signal.reason);
    const items: T[] = [];
    const off = subscribe((item) => {
      items.push(item);
      if (done(items)) finish(() => resolve(items));
    });
    const timer = setTimeout(() => finish(() => resolve(items)), windowMs);
    const abort = () => finish(() => reject(ctx.signal.reason));
    function finish(settle: () => void): void {
      clearTimeout(timer);
      off();
      ctx.signal.removeEventListener("abort", abort);
      settle();
    }
    ctx.signal.addEventListener("abort", abort, { once: true });
    try {
      send();
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

function leads(party: PartyState): boolean {
  return (
    party.inGroup &&
    party.leader !== null &&
    !party.members.some((member) => member.name === party.leader)
  );
}

export type DifficultyResult = InstancesOutcome<{ result: "changed" }>;
export type ResetResult = InstancesOutcome<{
  reset: readonly number[];
  failed: readonly number[];
}>;

export async function requestDifficulty(
  ctx: Ctx,
  store: InstancesStore,
  init: DifficultyRequest,
): Promise<DifficultyResult> {
  const { kind, value } = init;
  if (!Number.isInteger(value) || value < 0 || value >= MODE_LIMIT[kind])
    return { status: "refused", reason: "out_of_range" };
  const state = store.snapshot();
  const known =
    kind === "dungeon" ? state.dungeonDifficulty : state.raidDifficulty;
  const current =
    state.pendingDifficulty?.kind === kind
      ? state.pendingDifficulty.value
      : known;
  if (current === value) return { status: "refused", reason: "unchanged" };
  const party = ctx.legacy.party();
  if (party.inGroup && !leads(party))
    return { status: "refused", reason: "not_leader" };
  const opcode =
    kind === "dungeon"
      ? GameOpcode.MSG_SET_DUNGEON_DIFFICULTY
      : GameOpcode.MSG_SET_RAID_DIFFICULTY;
  const body =
    kind === "dungeon"
      ? buildSetDungeonDifficulty(value)
      : buildSetRaidDifficulty(value);
  const bodies = await gather<DifficultyBody>(
    ctx,
    (cb) => store.onDifficultyBody(cb),
    () => ctx.send(opcode, body),
    {
      windowMs: DIFFICULTY_ECHO_MS,
      done: (items) => items.some((item) => item.kind === kind),
    },
  );
  const echo = bodies.find((item) => item.kind === kind);
  if (echo)
    return echo.difficulty === value
      ? { status: "ok", result: "changed" }
      : { status: "refused", reason: "server_refused" };
  if (party.inGroup) return { status: "no_answer" };
  store.pendDifficulty(kind, value);
  return { status: "unconfirmed_solo" };
}

export async function requestReset(
  ctx: Ctx,
  store: InstancesStore,
): Promise<ResetResult> {
  const party = ctx.legacy.party();
  if (party.inGroup && !leads(party))
    return { status: "refused", reason: "not_leader" };
  const dungeon = store.snapshot().dungeonDifficulty;
  if (
    !party.inGroup &&
    dungeon !== undefined &&
    dungeon >= HEROIC_OR_HIGHER_DUNGEON
  )
    return { status: "refused", reason: "heroic_no_reset" };
  const events = await gather<InstancesEvent>(
    ctx,
    (cb) => store.onEvent(cb),
    () => ctx.send(GameOpcode.CMSG_RESET_INSTANCES, buildResetInstances()),
    { windowMs: RESET_WINDOW_MS, done: () => false },
  );
  const reset = new Set<number>();
  const failed = new Set<number>();
  for (const event of events) {
    if (event.type === "reset") reset.add(event.mapId);
    if (event.type === "reset_failed" || event.type === "reset_blocked")
      failed.add(event.mapId);
  }
  if (reset.size === 0 && failed.size === 0)
    return { status: "nothing_to_reset" };
  return { status: "ok", reset: [...reset], failed: [...failed] };
}
