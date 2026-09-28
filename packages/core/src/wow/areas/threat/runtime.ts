import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import type { ThreatEvent, ThreatStore } from "#wow/areas/threat/store";
import type { EntityEvent } from "#wow/entity-store";

function isDead(event: EntityEvent): boolean {
  if (event.type !== "update" || !("health" in event.entity)) return false;
  return event.entity.health === 0 && event.entity.maxHealth > 0;
}

export function threatRuntime(
  ctx: AreaRuntimeCtx<ThreatEvent>,
  store: ThreatStore,
): AreaRuntime<Readonly<Record<never, never>>> {
  const off = ctx.listen("entity", (event) => {
    if (event.type === "disappear") store.forget(event.guid);
    else if (isDead(event)) store.forget(event.entity.guid);
  });
  return { act: {}, dispose: off };
}
