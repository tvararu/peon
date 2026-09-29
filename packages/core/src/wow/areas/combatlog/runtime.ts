import type {
  CombatlogEvent,
  CombatlogStore,
} from "#wow/areas/combatlog/store";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";

export const FIGHT_QUIET_MS = 6000;

export function combatlogRuntime(
  ctx: AreaRuntimeCtx<CombatlogEvent>,
  store: CombatlogStore,
): AreaRuntime<Readonly<Record<never, never>>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const off = store.onEvent((event) => {
    if (event.type !== "entry") return;
    if (!(store.isOurs(event.source) || store.isOurs(event.target))) return;
    stop();
    timer = setTimeout(() => {
      timer = undefined;
      if (!ctx.signal.aborted) store.closeFight();
    }, FIGHT_QUIET_MS);
  });
  return {
    act: {},
    dispose: () => {
      off();
      stop();
    },
  };
}
