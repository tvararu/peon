import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildPetAction,
  buildPetStopAttack,
  buildRequestPetInfo,
  PET_ACTION,
} from "#wow/areas/pets/protocol";
import type { PetsEvent, PetsStore } from "#wow/areas/pets/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export type PetOrder = "stay" | "follow" | "dismiss";
export type PetStance = "passive" | "defensive" | "aggressive";
export type PetsRefused = {
  ok: false;
  reason: "no_pet" | "hunter_pet_dismiss";
};
export type PetsActResult = { ok: true } | PetsRefused;
export type PetsActs = {
  requestPetInfo: () => { ok: true };
  petCommand: (order: PetOrder) => PetsActResult;
  petStance: (stance: PetStance) => PetsActResult;
  petStopAttack: () => PetsActResult;
};

const ORDERS: Record<PetOrder, number> = { stay: 0, follow: 1, dismiss: 3 };
const STANCES: Record<PetStance, number> = {
  passive: 0,
  defensive: 1,
  aggressive: 2,
};
const NO_PET: PetsRefused = { ok: false, reason: "no_pet" };

export function petsRuntime(
  ctx: AreaRuntimeCtx<PetsEvent>,
  store: PetsStore,
): AreaRuntime<PetsActs> {
  function requestPetInfo(): { ok: true } {
    ctx.send(GameOpcode.CMSG_REQUEST_PET_INFO, buildRequestPetInfo());
    return { ok: true };
  }

  function confirm(pet: bigint, type: number, value: number): PetsActResult {
    ctx.send(GameOpcode.CMSG_PET_ACTION, buildPetAction(pet, type, value, 0n));
    return requestPetInfo();
  }

  function petCommand(order: PetOrder): PetsActResult {
    const { bar, pet } = store.snapshot();
    if (!bar) return NO_PET;
    if (order !== "dismiss")
      return confirm(bar.guid, PET_ACTION.command, ORDERS[order]);
    if (!pet) return NO_PET;
    if (pet.canAbandon) return { ok: false, reason: "hunter_pet_dismiss" };
    ctx.send(
      GameOpcode.CMSG_PET_ACTION,
      buildPetAction(bar.guid, PET_ACTION.command, ORDERS.dismiss, 0n),
    );
    return { ok: true };
  }

  function petStance(stance: PetStance): PetsActResult {
    const { bar } = store.snapshot();
    if (!bar) return NO_PET;
    return confirm(bar.guid, PET_ACTION.reaction, STANCES[stance]);
  }

  function petStopAttack(): PetsActResult {
    const { bar } = store.snapshot();
    if (!bar) return NO_PET;
    ctx.send(GameOpcode.CMSG_PET_STOP_ATTACK, buildPetStopAttack(bar.guid));
    return { ok: true };
  }

  return {
    act: { requestPetInfo, petCommand, petStance, petStopAttack },
    dispose: () => undefined,
  };
}
