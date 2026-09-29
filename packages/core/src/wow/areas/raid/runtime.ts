import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  composeStatsRuntime,
  type StatsActs,
} from "#wow/areas/raid/runtime-stats";
import type { RaidAreaStore } from "#wow/areas/raid/store";
import type { RaidChange, RaidEvent } from "#wow/areas/raid/store-roster";

export type GroupChangeMatch = {
  kinds: readonly RaidChange["kind"][];
};

export type RaidActs = StatsActs & {
  awaitGroupChange: (
    match: GroupChangeMatch,
    timeoutMs: number,
  ) => Promise<RaidEvent>;
};

type Ctx = AreaRuntimeCtx<RaidEvent>;

function matches(event: RaidEvent, match: GroupChangeMatch): boolean {
  if (event.type === "disbanded") {
    return match.kinds.every((kind) => kind === "disbanded");
  }
  if (event.type !== "group_list") return false;
  return match.kinds.every((kind) =>
    event.changes.some((change) => change.kind === kind),
  );
}

export function raidRuntime(
  ctx: Ctx,
  store: RaidAreaStore,
): AreaRuntime<RaidActs> {
  const stats = composeStatsRuntime({ ctx, store });
  function awaitGroupChange(
    match: GroupChangeMatch,
    timeoutMs: number,
  ): Promise<RaidEvent> {
    return ctx.until((event) => matches(event, match), { timeoutMs });
  }
  return {
    act: { awaitGroupChange, ...stats.act },
    dispose: () => stats.dispose(),
  };
}
