import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildSetFactionAtWar,
  buildSetFactionInactive,
  buildSetWatchedFaction,
} from "#wow/areas/reputation/protocol";
import {
  FACTION_FLAGS,
  type ReputationEvent,
  type ReputationStore,
  type SettingFlag,
} from "#wow/areas/reputation/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const WATCHED_ANSWER_MS = 5000;

export type FactionRef = number | string;
export type SettingRefusal =
  | "unknown_faction"
  | "cannot_change"
  | "own_faction"
  | "not_visible"
  | "unchanged";
export type SettingResult =
  | { sent: true }
  | { sent: false; reason: SettingRefusal };

export type ReputationSettingActs = {
  setAtWar: (faction: FactionRef, atWar: boolean) => SettingResult;
  setInactive: (faction: FactionRef, inactive: boolean) => SettingResult;
  setWatched: (faction: FactionRef | undefined) => Promise<SettingResult>;
};

type Env = {
  ctx: AreaRuntimeCtx<ReputationEvent>;
  store: ReputationStore;
};

const refuse = (reason: SettingRefusal): SettingResult => ({
  reason,
  sent: false,
});

function resolve(
  store: ReputationStore,
  faction: FactionRef,
): number | undefined {
  if (typeof faction === "number")
    return store.flagsOf(faction) === undefined ? undefined : faction;
  const wanted = faction.toLowerCase();
  return store.list().find((row) => row.name?.toLowerCase() === wanted)
    ?.repListId;
}

function refusalFor(
  flags: number,
  flag: SettingFlag,
  on: boolean,
): SettingRefusal | undefined {
  const { HIDDEN, INVISIBLE_FORCED, PEACE_FORCED, VISIBLE } = FACTION_FLAGS;
  const bit = flag === "atWar" ? FACTION_FLAGS.AT_WAR : FACTION_FLAGS.INACTIVE;
  if (flag === "atWar") {
    if (flags & (INVISIBLE_FORCED | HIDDEN)) return "cannot_change";
    if (on && flags & PEACE_FORCED) return "own_faction";
  } else if (on) {
    if (flags & (INVISIBLE_FORCED | HIDDEN)) return "cannot_change";
    if (!(flags & VISIBLE)) return "not_visible";
  }
  return ((flags & bit) !== 0) === on ? "unchanged" : undefined;
}

function changeFlag(
  env: Env,
  faction: FactionRef,
  flag: SettingFlag,
  on: boolean,
): SettingResult {
  const repListId = resolve(env.store, faction);
  const flags =
    repListId === undefined ? undefined : env.store.flagsOf(repListId);
  if (repListId === undefined || flags === undefined)
    return refuse("unknown_faction");
  const reason = refusalFor(flags, flag, on);
  if (reason) return refuse(reason);
  env.ctx.signal.throwIfAborted();
  if (flag === "atWar")
    env.ctx.send(
      GameOpcode.CMSG_SET_FACTION_ATWAR,
      buildSetFactionAtWar(repListId, on),
    );
  else
    env.ctx.send(
      GameOpcode.CMSG_SET_FACTION_INACTIVE,
      buildSetFactionInactive(repListId, on),
    );
  env.store.setPendingFlag(repListId, flag, on);
  return { sent: true };
}

async function changeWatched(
  env: Env,
  faction: FactionRef | undefined,
): Promise<SettingResult> {
  const repListId =
    faction === undefined ? undefined : resolve(env.store, faction);
  if (faction !== undefined && repListId === undefined)
    return refuse("unknown_faction");
  if (repListId === env.store.snapshot().watched) return refuse("unchanged");
  const scope = new AbortController();
  const waited = env.ctx.until(
    (event) =>
      event.type === "watched_changed" && event.repListId === repListId,
    {
      signal: AbortSignal.any([env.ctx.signal, scope.signal]),
      timeoutMs: WATCHED_ANSWER_MS,
    },
  );
  try {
    env.ctx.signal.throwIfAborted();
    env.ctx.send(
      GameOpcode.CMSG_SET_WATCHED_FACTION,
      buildSetWatchedFaction(repListId),
    );
  } catch (error) {
    scope.abort();
    await waited.catch(() => undefined);
    throw error;
  }
  await waited;
  return { sent: true };
}

export function reputationSettingActs(env: Env): ReputationSettingActs {
  return {
    setAtWar: (faction, atWar) => changeFlag(env, faction, "atWar", atWar),
    setInactive: (faction, inactive) =>
      changeFlag(env, faction, "inactive", inactive),
    setWatched: (faction) => changeWatched(env, faction),
  };
}
