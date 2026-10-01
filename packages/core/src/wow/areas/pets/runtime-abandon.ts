import type { AreaRuntimeCtx } from "#wow/areas/contract";
import { buildDismissCritter, buildPetAbandon } from "#wow/areas/pets/protocol";
import type { PetsEvent, PetsStore } from "#wow/areas/pets/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export type PetsRefused = {
  ok: false;
  reason:
    | "no_pet"
    | "hunter_pet_dismiss"
    | "not_known"
    | "dead"
    | "not_autocastable"
    | "bad_slot"
    | "passive"
    | "not_removable"
    | "not_renamable"
    | "no_critter"
    | "empty_list"
    | "too_many";
};
export type PetsCast =
  | { ok: true; castCount: number; confirmed: boolean }
  | PetsRefused;
export type PetsActResult = { ok: true } | PetsRefused;
export type AbandonActs = {
  abandonPet: () => PetsActResult;
  dismissCritter: () => PetsActResult;
};

export const NO_PET: PetsRefused = { ok: false, reason: "no_pet" };

type Ctx = AreaRuntimeCtx<PetsEvent>;

export function abandonActs(ctx: Ctx, store: PetsStore): AbandonActs {
  return {
    abandonPet: () => {
      const { bar, pet } = store.snapshot();
      if (!(bar && pet)) return NO_PET;
      ctx.send(GameOpcode.CMSG_PET_ABANDON, buildPetAbandon(bar.guid));
      return { ok: true };
    },
    dismissCritter: () => {
      const critter = store.critter();
      if (critter === 0n) return { ok: false, reason: "no_critter" };
      ctx.send(GameOpcode.CMSG_DISMISS_CRITTER, buildDismissCritter(critter));
      return { ok: true };
    },
  };
}
