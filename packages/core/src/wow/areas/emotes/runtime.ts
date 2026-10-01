import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { type EmotesActs, emoteActs } from "#wow/areas/emotes/acts";
import type { EmoteStore, EmotesEvent } from "#wow/areas/emotes/store";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

function unitOf(entity: Entity | undefined): Entity | undefined {
  return entity?.objectType === ObjectType.UNIT ||
    entity?.objectType === ObjectType.PLAYER
    ? entity
    : undefined;
}

export function emotesRuntime(
  ctx: AreaRuntimeCtx<EmotesEvent>,
  store: EmoteStore,
): AreaRuntime<EmotesActs> {
  const off = ctx.listen("entity", (event) => {
    if (event.type === "disappear") {
      store.forget(event.guid);
      return;
    }
    const unit = unitOf(event.entity);
    if (unit)
      store.setEmoteState(
        unit.guid,
        unit.rawFields.get(UNIT_FIELDS.NPC_EMOTESTATE.offset),
      );
  });
  const { acts, cancelWaits } = emoteActs(ctx, store);
  return {
    act: acts,
    dispose: () => {
      off();
      cancelWaits();
    },
  };
}
