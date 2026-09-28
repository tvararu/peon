import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import type {
  UnitmotionEvent,
  UnitmotionStore,
} from "#wow/areas/unitmotion/store";

export function unitmotionRuntime(
  ctx: AreaRuntimeCtx<UnitmotionEvent>,
  store: UnitmotionStore,
): AreaRuntime<Readonly<Record<never, never>>> {
  const off = ctx.listen("entity", (event) => {
    if (event.type === "disappear") store.forget(event.guid);
  });
  return { act: {}, dispose: off };
}
