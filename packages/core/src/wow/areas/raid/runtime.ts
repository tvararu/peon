import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import type { RaidChange, RaidEvent } from "#wow/areas/raid/store-roster";

export type GroupChangeMatch = {
  kinds: readonly RaidChange["kind"][];
};

export type RaidActs = {
  awaitGroupChange: (
    match: GroupChangeMatch,
    timeoutMs: number,
  ) => Promise<RaidEvent>;
};

type Ctx = AreaRuntimeCtx<RaidEvent>;

function matches(event: RaidEvent, match: GroupChangeMatch): boolean {
  if (event.type !== "group_list") return false;
  return match.kinds.every((kind) =>
    event.changes.some((change) => change.kind === kind),
  );
}

export function raidRuntime(ctx: Ctx): AreaRuntime<RaidActs> {
  function awaitGroupChange(
    match: GroupChangeMatch,
    timeoutMs: number,
  ): Promise<RaidEvent> {
    return ctx.until((event) => matches(event, match), { timeoutMs });
  }
  return { act: { awaitGroupChange }, dispose: () => undefined };
}
