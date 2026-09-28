import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { buildAreaTrigger } from "#wow/areas/objects/protocol";
import type { ObjectsEvent, ObjectsStore } from "#wow/areas/objects/store";
import { loadAreaTriggers } from "#wow/areas/objects/trigger-catalog";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { SelfEvent } from "#wow/self-store";
import type { CoreStores } from "#wow/session-stores";

export type ObjectsActs = { enterTrigger: (triggerId: number) => void };

const ARRIVALS = new Set(["teleport", "near_teleport", "new_world"]);

function loadTriggers(
  ctx: AreaRuntimeCtx<ObjectsEvent>,
  store: ObjectsStore,
): void {
  const { dbc, signal } = ctx;
  if (!dbc) return;
  store.loadingTriggers();
  loadAreaTriggers(dbc)
    .then(
      (catalog) => {
        if (!signal.aborted) store.useTriggers(catalog);
      },
      () => store.triggersFailed(),
    )
    .catch(ignoreFailure);
}

export function objectsRuntime(
  ctx: AreaRuntimeCtx<ObjectsEvent>,
  store: ObjectsStore,
  core: CoreStores,
): AreaRuntime<ObjectsActs> {
  function enterTrigger(triggerId: number): void {
    ctx.send(GameOpcode.CMSG_AREATRIGGER, buildAreaTrigger(triggerId));
    store.noteSent(triggerId, core.self.mapId);
  }
  function arrival(event: SelfEvent): void {
    if (event.type === "login_verified" || event.type === "new_world")
      store.arrive(event.position);
    else if (event.type === "teleport_ack")
      store.arrive({ ...event.ack.info, mapId: core.self.mapId });
  }
  loadTriggers(ctx, store);
  const offControl = ctx.listen("control", ({ type, state, reason }) => {
    if (!state.pose) return;
    if (type === "pose_sent")
      for (const id of store.move(state.pose)) enterTrigger(id);
    else if (type === "server_correction" && ARRIVALS.has(reason ?? ""))
      store.arrive(state.pose);
  });
  const offSelf = core.self.onEvent(arrival);
  return {
    act: { enterTrigger },
    dispose: () => {
      offControl();
      offSelf();
    },
  };
}
