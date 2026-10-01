import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildFarSight,
  buildMirrorImageRequest,
} from "#wow/areas/spells/protocol";
import type { SpellsActResult, SpellsActs } from "#wow/areas/spells/runtime";
import type { SpellsEvent, SpellsStore } from "#wow/areas/spells/store";
import { GameOpcode } from "#wow/protocol/opcodes";

type SightActFns = Pick<SpellsActs, "requestMirrorImage" | "setFarSight">;

export function sightActs(
  ctx: AreaRuntimeCtx<SpellsEvent>,
  store: SpellsStore,
): SightActFns {
  const requestMirrorImage = (guid: bigint): SpellsActResult => {
    const outcome = store.requestMirrorImage(guid);
    if (outcome !== "ok") return { ok: false, reason: outcome };
    ctx.send(
      GameOpcode.CMSG_GET_MIRRORIMAGE_DATA,
      buildMirrorImageRequest(guid),
    );
    return { ok: true };
  };
  const setFarSight = (on: boolean): SpellsActResult => {
    ctx.send(GameOpcode.CMSG_FAR_SIGHT, buildFarSight(on));
    return { ok: true };
  };
  return { requestMirrorImage, setFarSight };
}
