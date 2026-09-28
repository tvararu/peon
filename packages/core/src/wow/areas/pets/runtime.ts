import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { buildRequestPetInfo } from "#wow/areas/pets/protocol";
import type { PetsEvent, PetsStore } from "#wow/areas/pets/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export type PetsActs = { requestPetInfo: () => { ok: true } };

export function petsRuntime(
  ctx: AreaRuntimeCtx<PetsEvent>,
  _store: PetsStore,
): AreaRuntime<PetsActs> {
  function requestPetInfo(): { ok: true } {
    ctx.send(GameOpcode.CMSG_REQUEST_PET_INFO, buildRequestPetInfo());
    return { ok: true };
  }
  return { act: { requestPetInfo }, dispose: () => undefined };
}
