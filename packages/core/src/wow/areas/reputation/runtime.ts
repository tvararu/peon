import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { loadFactionCatalog } from "#wow/areas/reputation/catalog";
import { reputationRelationView } from "#wow/areas/reputation/relation";
import type {
  ReputationEvent,
  ReputationStore,
} from "#wow/areas/reputation/store";
import type { Entity } from "#wow/entity-store";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { ReputationRelationView } from "#wow/unit-relation";

export type ReputationActs = {
  relationView: () => ReputationRelationView;
};

function readCharacter(store: ReputationStore, entity: Entity): void {
  const bytes0 = entity.rawFields.get(UNIT_FIELDS.BYTES_0.offset);
  const race = (bytes0 ?? 0) & 0xff;
  const class_ = ((bytes0 ?? 0) >> 8) & 0xff;
  if (race > 0 && class_ > 0)
    store.setCharacter(1 << (race - 1), 1 << (class_ - 1));
  const watched = entity.rawFields.get(
    PLAYER_FIELDS.WATCHED_FACTION_INDEX.offset,
  );
  if (watched !== undefined) store.receiveWatched(watched);
}

export function reputationRuntime(
  ctx: AreaRuntimeCtx<ReputationEvent>,
  store: ReputationStore,
): AreaRuntime<ReputationActs> {
  if (ctx.dbc)
    loadFactionCatalog(ctx.dbc)
      .then((catalog) => {
        if (!ctx.signal.aborted) store.setCatalog(catalog);
      })
      .catch(ignoreFailure);
  const off = ctx.listen("entity", (event) => {
    const entity = event.type === "disappear" ? undefined : event.entity;
    if (entity && entity.guid === ctx.selfGuid()) readCharacter(store, entity);
  });
  const view = reputationRelationView(store);
  return { act: { relationView: () => view }, dispose: off };
}
