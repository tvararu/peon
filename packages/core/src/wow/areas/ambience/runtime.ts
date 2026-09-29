import {
  buildCompleteCinematic,
  buildNextCinematicCamera,
  buildZoneUpdate,
} from "#wow/areas/ambience/protocol";
import type { AmbienceEvent, AmbienceStore } from "#wow/areas/ambience/store";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export type AmbienceActs = {
  sendZoneUpdate: (zoneId: number) => void;
  completeCinematic: () => void;
  nextCinematicCamera: () => void;
};

export function ambienceRuntime(
  ctx: AreaRuntimeCtx<AmbienceEvent>,
  store: AmbienceStore,
): AreaRuntime<AmbienceActs> {
  const off = store.onEvent((event) => {
    if (event.type !== "cinematic" || event.cinematic.completed) return;
    store.completeCinematic();
    ctx.send(GameOpcode.CMSG_COMPLETE_CINEMATIC, buildCompleteCinematic());
  });
  return {
    act: {
      sendZoneUpdate: (zoneId) =>
        ctx.send(GameOpcode.CMSG_ZONEUPDATE, buildZoneUpdate(zoneId)),
      completeCinematic: () => {
        store.completeCinematic();
        ctx.send(GameOpcode.CMSG_COMPLETE_CINEMATIC, buildCompleteCinematic());
      },
      nextCinematicCamera: () =>
        ctx.send(
          GameOpcode.CMSG_NEXT_CINEMATIC_CAMERA,
          buildNextCinematicCamera(),
        ),
    },
    dispose: () => off(),
  };
}
