import { buildZoneUpdate } from "#wow/areas/ambience/protocol";
import type { AmbienceEvent, AmbienceStore } from "#wow/areas/ambience/store";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export type AmbienceActs = {
  sendZoneUpdate: (zoneId: number) => void;
};

export function ambienceRuntime(
  ctx: AreaRuntimeCtx<AmbienceEvent>,
  _store: AmbienceStore,
): AreaRuntime<AmbienceActs> {
  return {
    act: {
      sendZoneUpdate: (zoneId) =>
        ctx.send(GameOpcode.CMSG_ZONEUPDATE, buildZoneUpdate(zoneId)),
    },
    dispose: () => undefined,
  };
}
