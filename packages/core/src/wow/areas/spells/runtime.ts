import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import type { SpellsEvent, SpellsStore } from "#wow/areas/spells/store";
import type { CoreStores } from "#wow/session-stores";

export type SpellsActResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export type SpellsActs = { cancelChannel: () => SpellsActResult };

export function spellsRuntime(
  ctx: AreaRuntimeCtx<SpellsEvent>,
  store: SpellsStore,
  core: CoreStores,
): AreaRuntime<SpellsActs> {
  function cancelChannel(): SpellsActResult {
    const channel = core.combat.casts.channel;
    if (!channel) return { ok: false, reason: "not_channelling" };
    if (channel.cancelRequested)
      return { ok: false, reason: "cancel_requested" };
    core.combat.casts.cancel(ctx.send);
    return { ok: true };
  }
  const off = ctx.listen("entity", (event) => {
    if (event.type === "update" && event.entity.guid === ctx.selfGuid())
      store.selfFields(event.entity.rawFields);
  });
  return { act: { cancelChannel }, dispose: off };
}
