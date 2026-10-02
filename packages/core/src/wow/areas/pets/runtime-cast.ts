import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildPetCancelAura,
  buildPetCastSpell,
  buildPetSpellAutocast,
  buildRequestPetInfo,
} from "#wow/areas/pets/protocol";
import type { PetsActs } from "#wow/areas/pets/runtime";
import {
  NO_PET,
  type PetsCast,
  type PetsRefused,
} from "#wow/areas/pets/runtime-abandon";
import type { PetsBar, PetsEvent, PetsStore } from "#wow/areas/pets/store";
import type { PetView } from "#wow/areas/pets/view";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

type Ctx = AreaRuntimeCtx<PetsEvent>;
type Target = Parameters<PetsActs["petCast"]>[1];
type SendCast = (guid: bigint, spell: number, target: Target) => number;
const SPELL_ATTR0_PASSIVE = 0x40;
const VEHICLE_BUTTON_FIRST = 8;
const VEHICLE_BUTTON_LAST = 12;
const VEHICLE_FLAGS = 0x8_00;

function vehicleSpellOf(
  bar: { flags: number; slots: readonly { action: number; type: number }[] },
  spell: number,
): boolean {
  if ((bar.flags & VEHICLE_FLAGS) === 0 || spell === 0) return false;
  return bar.slots.some(
    (slot) =>
      slot.action === spell &&
      slot.type >= VEHICLE_BUTTON_FIRST &&
      slot.type <= VEHICLE_BUTTON_LAST,
  );
}

type PetCastRequest = {
  bar: PetsBar;
  pet: PetView | undefined;
  spell: number;
  target: Target;
};

function castRefusal(
  request: PetCastRequest,
  raw: number | undefined,
): PetsRefused | undefined {
  if (!request.bar.spells.some((entry) => entry.spell === request.spell))
    return { ok: false, reason: "not_known" };
  if (raw !== undefined && (raw & SPELL_ATTR0_PASSIVE) !== 0)
    return { ok: false, reason: "passive" };
  if (!request.pet) return NO_PET;
  if (request.pet.health === 0) return { ok: false, reason: "dead" };
  return undefined;
}

function castPetSpell(
  send: SendCast,
  core: CoreStores,
  request: PetCastRequest,
): PetsCast {
  if (vehicleSpellOf(request.bar, request.spell))
    return {
      castCount: send(request.bar.guid, request.spell, request.target),
      confirmed: false,
      ok: true,
    };
  const raw = core.combat.definition(request.spell)?.attributes.raw;
  const refusal = castRefusal(request, raw);
  if (refusal) return refusal;
  return {
    castCount: send(request.bar.guid, request.spell, request.target),
    confirmed: raw !== undefined,
    ok: true,
  };
}

export function requestPetInfo(ctx: Ctx): { ok: true } {
  ctx.send(GameOpcode.CMSG_REQUEST_PET_INFO, buildRequestPetInfo());
  return { ok: true };
}

export function spellActs(
  ctx: Ctx,
  store: PetsStore,
  core: CoreStores,
): Pick<PetsActs, "petAutocast" | "petCancelAura" | "petCast"> {
  let castCount = 0;
  const send: SendCast = (guid, spell, target) => {
    castCount = castCount === 255 ? 1 : castCount + 1;
    ctx.send(
      GameOpcode.CMSG_PET_CAST_SPELL,
      buildPetCastSpell(guid, castCount, spell, target),
    );
    return castCount;
  };
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
      return castPetSpell(send, core, { bar, pet, spell, target });
    },
  };
}
