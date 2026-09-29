import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildPetAction,
  buildPetCancelAura,
  buildPetCastSpell,
  buildPetSetAction,
  buildPetSpellAutocast,
  buildPetStopAttack,
  buildRequestPetInfo,
  PET_ACTION,
  type PetSetActionPair,
} from "#wow/areas/pets/protocol";
import type { PetsEvent, PetsStore } from "#wow/areas/pets/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { SpellTarget } from "#wow/protocol/spell-targets";
export type PetOrder = "stay" | "follow" | "dismiss";
export type PetStance = "passive" | "defensive" | "aggressive";
export type PetsRefused = {
  ok: false;
  reason:
    | "no_pet"
    | "hunter_pet_dismiss"
    | "not_known"
    | "dead"
    | "not_autocastable"
    | "bad_slot";
};
export type PetsCast = { ok: true; castCount: number } | PetsRefused;
export type PetsActResult = { ok: true } | PetsRefused;
export type PetsActs = {
  requestPetInfo: () => { ok: true };
  petCommand: (order: PetOrder) => PetsActResult;
  petStance: (stance: PetStance) => PetsActResult;
  petStopAttack: () => PetsActResult;
  petCast: (spell: number, target: SpellTarget) => PetsCast;
  petAutocast: (spell: number, on: boolean) => PetsActResult;
  petSetAction: (slot: number, action: number, type: number) => PetsActResult;
  petSwapActions: (a: number, b: number) => PetsActResult;
  petCancelAura: (spell: number) => PetsActResult;
};

const ORDERS: Record<PetOrder, number> = { stay: 0, follow: 1, dismiss: 3 };
const STANCES: Record<PetStance, number> = {
  passive: 0,
  defensive: 1,
  aggressive: 2,
};
const NO_PET: PetsRefused = { ok: false, reason: "no_pet" };

type Ctx = AreaRuntimeCtx<PetsEvent>;

function requestPetInfo(ctx: Ctx): { ok: true } {
  ctx.send(GameOpcode.CMSG_REQUEST_PET_INFO, buildRequestPetInfo());
  return { ok: true };
}

function confirm(
  ctx: Ctx,
  pet: bigint,
  type: number,
  value: number,
): PetsActResult {
  ctx.send(GameOpcode.CMSG_PET_ACTION, buildPetAction(pet, type, value, 0n));
  return requestPetInfo(ctx);
}

function orderActs(
  ctx: Ctx,
  store: PetsStore,
): Pick<PetsActs, "petCommand" | "petStance" | "petStopAttack"> {
  return {
    petCommand: (order) => {
      const { bar, pet } = store.snapshot();
      if (!bar) return NO_PET;
      if (order !== "dismiss")
        return confirm(ctx, bar.guid, PET_ACTION.command, ORDERS[order]);
      if (!pet) return NO_PET;
      if (pet.canAbandon) return { ok: false, reason: "hunter_pet_dismiss" };
      ctx.send(
        GameOpcode.CMSG_PET_ACTION,
        buildPetAction(bar.guid, PET_ACTION.command, ORDERS.dismiss, 0n),
      );
      return { ok: true };
    },
    petStance: (stance) => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      return confirm(ctx, bar.guid, PET_ACTION.reaction, STANCES[stance]);
    },
    petStopAttack: () => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      ctx.send(GameOpcode.CMSG_PET_STOP_ATTACK, buildPetStopAttack(bar.guid));
      return { ok: true };
    },
  };
}

function spellActs(
  ctx: Ctx,
  store: PetsStore,
): Pick<PetsActs, "petAutocast" | "petCancelAura" | "petCast"> {
  let castCount = 0;
  return {
    petAutocast: (spell, on) => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      const row = bar.spells.find((entry) => entry.spell === spell);
      if (!row) return { ok: false, reason: "not_known" };
      if (row.autocast === "passive")
        return { ok: false, reason: "not_autocastable" };
      ctx.send(
        GameOpcode.CMSG_PET_SPELL_AUTOCAST,
        buildPetSpellAutocast(bar.guid, spell, on),
      );
      return requestPetInfo(ctx);
    },
    petCancelAura: (spell) => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      ctx.send(
        GameOpcode.CMSG_PET_CANCEL_AURA,
        buildPetCancelAura(bar.guid, spell),
      );
      return { ok: true };
    },
    petCast: (spell, target) => {
      const { bar, pet } = store.snapshot();
      if (!bar) return NO_PET;
      if (!bar.spells.some((row) => row.spell === spell))
        return { ok: false, reason: "not_known" };
      if (!pet) return NO_PET;
      if (pet.health === 0) return { ok: false, reason: "dead" };
      castCount = castCount === 255 ? 1 : castCount + 1;
      ctx.send(
        GameOpcode.CMSG_PET_CAST_SPELL,
        buildPetCastSpell(bar.guid, castCount, spell, target),
      );
      return { castCount, ok: true };
    },
  };
}

function barActs(
  ctx: Ctx,
  store: PetsStore,
): Pick<PetsActs, "petSetAction" | "petSwapActions"> {
  return {
    petSetAction: (slot, action, type) => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      if (!(slot >= 0 && slot < 10)) return { ok: false, reason: "bad_slot" };
      const packed = ((type << 24) | (action & 0xff_ff_ff)) >>> 0;
      const pair: PetSetActionPair = { packed, slot };
      ctx.send(
        GameOpcode.CMSG_PET_SET_ACTION,
        buildPetSetAction(bar.guid, [pair]),
      );
      return { ok: true };
    },
    petSwapActions: (a, b) => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      if (!(a >= 0 && a < 10 && b >= 0 && b < 10))
        return { ok: false, reason: "bad_slot" };
      const packedOf = (slot: number) => {
        const entry = bar.slots[slot];
        return (
          (((entry?.type ?? 0) << 24) | ((entry?.action ?? 0) & 0xff_ff_ff)) >>>
          0
        );
      };
      ctx.send(
        GameOpcode.CMSG_PET_SET_ACTION,
        buildPetSetAction(bar.guid, [
          { packed: packedOf(b), slot: a },
          { packed: packedOf(a), slot: b },
        ]),
      );
      return { ok: true };
    },
  };
}

export function petsRuntime(ctx: Ctx, store: PetsStore): AreaRuntime<PetsActs> {
  const orders = orderActs(ctx, store);
  const spells = spellActs(ctx, store);
  const bar = barActs(ctx, store);
  return {
    act: {
      petAutocast: spells.petAutocast,
      petCancelAura: spells.petCancelAura,
      petCast: spells.petCast,
      petCommand: orders.petCommand,
      petSetAction: bar.petSetAction,
      petStance: orders.petStance,
      petStopAttack: orders.petStopAttack,
      petSwapActions: bar.petSwapActions,
      requestPetInfo: () => requestPetInfo(ctx),
    },
    dispose: () => undefined,
  };
}
