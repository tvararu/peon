import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  ACTION_BUTTON_TYPE_CODES,
  type BarButton,
  buildActionBarToggles,
  buildCancelAura,
  buildCancelGrowthAura,
  buildSetActionButton,
} from "#wow/areas/spells/protocol";
import type { SpellsEvent, SpellsStore } from "#wow/areas/spells/store";
import { ACTION_BUTTON_SLOTS } from "#wow/protocol/action-buttons";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export type SpellsActResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export type SpellsActs = {
  cancelChannel: () => SpellsActResult;
  cancelAura: (spellId: number) => SpellsActResult;
  cancelGrowthAura: () => SpellsActResult;
  setActionButton: (
    slot: number,
    button: BarButton | undefined,
  ) => SpellsActResult;
  setActionBarToggles: (mask: number) => SpellsActResult;
};

const PASSIVE = 0x40;
const SPELL_ATTR0_NO_AURA_CANCEL = 0x80_00_00_00;
const SPELL_ATTR1_CHANNELLED = 0x4 | 0x40;
const AFLAG_NEGATIVE = 0x80;

const MAX_ACTION = 0x00_ff_ff_ff;

const has = (bits: number | undefined, mask: number) =>
  ((bits ?? 0) & mask) !== 0;

function validButton(
  slot: number,
  button: BarButton | undefined,
  learned: () => number[],
): boolean {
  if (!Number.isInteger(slot) || slot < 0 || slot >= ACTION_BUTTON_SLOTS)
    return false;
  if (!button) return true;
  if (!Object.hasOwn(ACTION_BUTTON_TYPE_CODES, button.type)) return false;
  if (!Number.isInteger(button.id) || button.id <= 0 || button.id > MAX_ACTION)
    return false;
  return button.type !== "spell" || learned().includes(button.id);
}

function barActs(
  ctx: AreaRuntimeCtx<SpellsEvent>,
  core: CoreStores,
): Pick<SpellsActs, "setActionButton" | "setActionBarToggles"> {
  function setActionButton(
    slot: number,
    button: BarButton | undefined,
  ): SpellsActResult {
    if (!validButton(slot, button, () => core.combat.learned()))
      return { ok: false, reason: "invalid_button" };
    ctx.send(
      GameOpcode.CMSG_SET_ACTION_BUTTON,
      buildSetActionButton(slot, button),
    );
    core.actionBar.set(slot, button && { id: button.id, type: button.type });
    return { ok: true };
  }
  function setActionBarToggles(mask: number): SpellsActResult {
    if (!Number.isInteger(mask) || mask < 0 || mask > 0xff)
      return { ok: false, reason: "invalid_mask" };
    ctx.send(
      GameOpcode.CMSG_SET_ACTIONBAR_TOGGLES,
      buildActionBarToggles(mask),
    );
    return { ok: true };
  }
  return { setActionBarToggles, setActionButton };
}

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
  return {
    act: {
      cancelAura,
      cancelChannel,
      cancelGrowthAura,
      ...barActs(ctx, core),
    },
    dispose: off,
  };
}
