import {
  type BattlegroundsActs,
  battlegroundsRuntime,
} from "#wow/areas/battlegrounds/runtime";
import type {
  BattlegroundsEvent,
  BattlegroundsStore,
} from "#wow/areas/battlegrounds/store";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import type { CoreStores } from "#wow/session-stores";

export function battlegroundsSelfRuntime(
  ctx: AreaRuntimeCtx<BattlegroundsEvent>,
  store: BattlegroundsStore,
  core: CoreStores,
): AreaRuntime<BattlegroundsActs> {
  const off = ctx.listen("entity", (event) => {
    if (event.type !== "update" && event.type !== "appear") return;
    store.observeEntity(event.entity.guid);
  });
  const runtime = battlegroundsRuntime(ctx, store, core);
  return {
    act: runtime.act,
    dispose: () => {
      off();
      runtime.dispose();
    },
  };
}
