import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildPetCancelAura,
  buildPetCastSpell,
  buildPetSpellAutocast,
  buildRequestPetInfo,
} from "#wow/areas/pets/protocol";
import type { PetsActs } from "#wow/areas/pets/runtime";
import { NO_PET } from "#wow/areas/pets/runtime-abandon";
import type { PetsEvent, PetsStore } from "#wow/areas/pets/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

type Ctx = AreaRuntimeCtx<PetsEvent>;
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
      if (vehicleSpellOf(bar, spell)) {
        castCount = castCount === 255 ? 1 : castCount + 1;
        ctx.send(
          GameOpcode.CMSG_PET_CAST_SPELL,
          buildPetCastSpell(bar.guid, castCount, spell, target),
        );
        return { castCount, confirmed: false, ok: true };
      }
      const row = bar.spells.find((entry) => entry.spell === spell);
      if (!row) return { ok: false, reason: "not_known" };
      const raw = core.combat.definition(spell)?.attributes.raw;
      if (raw !== undefined && (raw & SPELL_ATTR0_PASSIVE) !== 0)
        return { ok: false, reason: "passive" };
      if (!pet) return NO_PET;
      if (pet.health === 0) return { ok: false, reason: "dead" };
      castCount = castCount === 255 ? 1 : castCount + 1;
      ctx.send(
        GameOpcode.CMSG_PET_CAST_SPELL,
        buildPetCastSpell(bar.guid, castCount, spell, target),
      );
      return { castCount, confirmed: raw !== undefined, ok: true };
    },
  };
}
