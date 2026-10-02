import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildInspectHonorStats,
  buildTogglePvp,
  type InspectHonorStats,
} from "#wow/areas/battlegrounds/protocol";
import type {
  BattlegroundsEvent,
  BattlegroundsStore,
} from "#wow/areas/battlegrounds/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const PVP_ANSWER_MS = 3000;

export type BattlegroundsSetPvpResult = { kind: "set"; on: boolean };

export type BattlegroundsActs = {
  setPvp: (on: boolean) => Promise<BattlegroundsSetPvpResult>;
  inspectHonor: (guid: bigint) => Promise<InspectHonorStats>;
};

function noAnswer(guid: bigint): Error {
  return new Error(`no_answer for ${guid.toString(10)}`);
}

export function battlegroundsRuntime(
  ctx: AreaRuntimeCtx<BattlegroundsEvent>,
  store: BattlegroundsStore,
  _core: CoreStores,
): AreaRuntime<BattlegroundsActs> {
  async function setPvp(on: boolean): Promise<BattlegroundsSetPvpResult> {
    if (store.snapshot().self.wantsFlag === on) return { kind: "set", on };
    const answered = ctx.until(
      (event) => event.type === "pvp_flag" && event.wants === on,
      {
        signal: ctx.signal,
        timeoutMs: PVP_ANSWER_MS,
      },
    );
    ctx.send(GameOpcode.CMSG_TOGGLE_PVP, buildTogglePvp(on));
    await answered;
    return { kind: "set", on };
  }

  async function inspectHonor(guid: bigint): Promise<InspectHonorStats> {
    const answered = ctx.until(
      (event) => event.type === "honor_inspect" && event.guid === guid,
      { signal: ctx.signal, timeoutMs: PVP_ANSWER_MS },
    );
    ctx.send(GameOpcode.MSG_INSPECT_HONOR_STATS, buildInspectHonorStats(guid));
    try {
      const event = await answered;
      if (event.type !== "honor_inspect") throw noAnswer(guid);
      return {
        guid: event.guid,
        honor: event.honor,
        kills: event.kills,
        lifetime: event.lifetime,
        today: event.today,
        yesterday: event.yesterday,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "timeout")
        throw noAnswer(guid);
      throw error;
    }
  }

  return { act: { inspectHonor, setPvp }, dispose: () => undefined };
}
