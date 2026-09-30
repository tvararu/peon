import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import { buildSummonResponse } from "#wow/areas/raid/protocol-summon";
import type { RaidAreaStore } from "#wow/areas/raid/store";
import type { RaidEvent } from "#wow/areas/raid/store-roster";
import { loadZoneNames } from "#wow/areas/raid/zone-names";
import { GameOpcode } from "#wow/protocol/opcodes";

export type SummonActs = {
  answerSummon: (accept: boolean) => void;
};

type Ctx = AreaRuntimeCtx<RaidEvent>;

export function composeSummonRuntime(env: { ctx: Ctx; store: RaidAreaStore }): {
  act: SummonActs;
  dispose: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  function stop(): void {
    clearTimeout(timer);
    timer = undefined;
  }
  if (env.ctx.dbc)
    loadZoneNames(env.ctx.dbc)
      .then((zones) => {
        if (!env.ctx.signal.aborted) env.store.setZoneNames(zones);
      })
      .catch(ignoreFailure);
  const off = env.store.onEvent((event) => {
    if (event.type === "summon_requested") {
      stop();
      const { expiresAt, timeoutMs } = event;
      timer = setTimeout(() => {
        timer = undefined;
        env.store.expireSummon(expiresAt);
      }, timeoutMs);
    } else if (event.type === "summon_expired") {
      stop();
    }
  });
  function answerSummon(accept: boolean): void {
    const summon = env.store.snapshot().summon;
    if (!summon) throw new Error("no_summon");
    env.ctx.send(
      GameOpcode.CMSG_SUMMON_RESPONSE,
      buildSummonResponse(summon.summoner, accept),
    );
    stop();
    env.store.clearSummon();
  }
  return {
    act: { answerSummon },
    dispose: () => {
      off();
      stop();
    },
  };
}
