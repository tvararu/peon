import {
  type AreaSpiritHealerTime,
  buildAreaSpiritHealerQuery,
  buildAreaSpiritHealerQueue,
  buildEmptyRequest,
  buildLeaveBattlefield,
  buildReportPvpAfk,
  type PlayerPositions,
  type PvpLogData,
} from "#wow/areas/battlegrounds/protocol-match";
import type {
  BattlegroundsEvent,
  BattlegroundsStore,
} from "#wow/areas/battlegrounds/store";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const BG_SCORE_MS = 3000;
export const BG_LEAVE_MS = 10_000;

export type BattlegroundsMatchActs = {
  requestScore: () => Promise<PvpLogData>;
  requestCarriers: () => Promise<PlayerPositions>;
  leaveBattleground: () => Promise<{ kind: "left" }>;
  reportAfk: (guid: bigint) => Promise<{ kind: "reported" }>;
  queueSpiritGuide: (guid: bigint) => Promise<AreaSpiritHealerTime>;
};

type Ctx = AreaRuntimeCtx<BattlegroundsEvent>;

type ScoreEvent = Extract<BattlegroundsEvent, { type: "bg_score" }>;
type CarriersEvent = Extract<BattlegroundsEvent, { type: "bg_carriers" }>;
type RezEvent = Extract<BattlegroundsEvent, { type: "bg_rez_time" }>;

function waitFor(
  ctx: Ctx,
  match: (event: BattlegroundsEvent) => boolean,
  timeoutMs: number,
): Promise<BattlegroundsEvent> {
  return ctx.until(match, { signal: ctx.signal, timeoutMs });
}

async function runScore(ctx: Ctx): Promise<PvpLogData> {
  const answered = waitFor(
    ctx,
    (entry) => entry.type === "bg_score",
    BG_SCORE_MS,
  );
  ctx.send(GameOpcode.MSG_PVP_LOG_DATA, buildEmptyRequest());
  const done = (await answered) as ScoreEvent;
  return done.score;
}

async function runCarriers(ctx: Ctx): Promise<PlayerPositions> {
  const answered = waitFor(
    ctx,
    (entry) => entry.type === "bg_carriers",
    BG_SCORE_MS,
  );
  ctx.send(GameOpcode.MSG_BATTLEGROUND_PLAYER_POSITIONS, buildEmptyRequest());
  const done = (await answered) as CarriersEvent;
  return done.positions;
}

async function runLeave(
  ctx: Ctx,
  store: BattlegroundsStore,
): Promise<{ kind: "left" }> {
  if (store.snapshot().match.current === undefined)
    throw new Error("not_in_battleground");
  if (store.selfInCombat()) throw new Error("in_combat");
  const answered = waitFor(
    ctx,
    (entry) =>
      entry.type === "bg_status" &&
      (entry.status.kind === "none" || entry.status.kind === "leaving"),
    BG_LEAVE_MS,
  );
  ctx.send(GameOpcode.CMSG_LEAVE_BATTLEFIELD, buildLeaveBattlefield());
  await answered;
  return { kind: "left" };
}

function runReport(
  ctx: Ctx,
  store: BattlegroundsStore,
  guid: bigint,
): Promise<{ kind: "reported" }> {
  try {
    if (store.snapshot().match.current === undefined)
      throw new Error("not_in_battleground");
    ctx.send(GameOpcode.CMSG_REPORT_PVP_AFK, buildReportPvpAfk(guid));
    return Promise.resolve({ kind: "reported" });
  } catch (error) {
    return Promise.reject(error);
  }
}

async function runGuide(ctx: Ctx, guid: bigint): Promise<AreaSpiritHealerTime> {
  const answered = waitFor(
    ctx,
    (entry) => entry.type === "bg_rez_time" && entry.guide === guid,
    BG_SCORE_MS,
  );
  ctx.send(
    GameOpcode.CMSG_AREA_SPIRIT_HEALER_QUERY,
    buildAreaSpiritHealerQuery(guid),
  );
  ctx.send(
    GameOpcode.CMSG_AREA_SPIRIT_HEALER_QUEUE,
    buildAreaSpiritHealerQueue(guid),
  );
  const done = (await answered) as RezEvent;
  return { guid: done.guide, ms: done.ms };
}

export function battlegroundsMatchRuntime(
  ctx: Ctx,
  store: BattlegroundsStore,
  core: CoreStores,
): AreaRuntime<BattlegroundsMatchActs> {
  const offSelf = core.self.onEvent((entry) => {
    if (entry.type !== "new_world") return;
    store.observeMap(entry.position.mapId);
  });
  return {
    act: {
      leaveBattleground: () => runLeave(ctx, store),
      queueSpiritGuide: (guid) => runGuide(ctx, guid),
      reportAfk: (guid) => runReport(ctx, store, guid),
      requestCarriers: () => runCarriers(ctx),
      requestScore: () => runScore(ctx),
    },
    dispose: offSelf,
  };
}
