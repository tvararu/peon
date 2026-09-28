import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildCancelAura,
  buildCancelGrowthAura,
} from "#wow/areas/spells/protocol";
import type { SpellsEvent, SpellsStore } from "#wow/areas/spells/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export type SpellsActResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export type SpellsActs = {
  cancelChannel: () => SpellsActResult;
  cancelAura: (spellId: number) => SpellsActResult;
  cancelGrowthAura: () => SpellsActResult;
};

const PASSIVE = 0x40;
const SPELL_ATTR0_NO_AURA_CANCEL = 0x80_00_00_00;
const SPELL_ATTR1_CHANNELLED = 0x4 | 0x40;
const AFLAG_NEGATIVE = 0x80;

const has = (bits: number | undefined, mask: number) =>
  ((bits ?? 0) & mask) !== 0;

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
  function cancelAura(spellId: number): SpellsActResult {
    if (!Number.isInteger(spellId) || spellId <= 0)
      return { ok: false, reason: "invalid_spell" };
    const def = core.combat.definition(spellId);
    if (has(def?.attributes.raw, SPELL_ATTR0_NO_AURA_CANCEL))
      return { ok: false, reason: "not_cancellable" };
    const channelSpell = core.combat.casts.channel?.spellId;
    if (channelSpell === spellId) return cancelChannel();
    if (has(def?.attributes.ex, SPELL_ATTR1_CHANNELLED))
      return { ok: false, reason: "not_channelling" };
    const aura = core.combat
      .record(undefined)
      .auras.find((a) => a.spellId === spellId);
    if (!aura) return { ok: false, reason: "not_aura" };
    if (has(aura.flags, AFLAG_NEGATIVE) || has(def?.attributes.raw, PASSIVE))
      return { ok: false, reason: "not_cancellable" };
    ctx.send(GameOpcode.CMSG_CANCEL_AURA, buildCancelAura(spellId));
    return { ok: true };
  }
  function cancelGrowthAura(): SpellsActResult {
    ctx.send(GameOpcode.CMSG_CANCEL_GROWTH_AURA, buildCancelGrowthAura());
    return { ok: true };
  }
  const off = ctx.listen("entity", (event) => {
    if (event.type === "update" && event.entity.guid === ctx.selfGuid())
      store.selfFields(event.entity.rawFields);
  });
  return { act: { cancelAura, cancelChannel, cancelGrowthAura }, dispose: off };
}
