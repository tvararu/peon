import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import type {
  InstancesEvent,
  InstancesStore,
} from "#wow/areas/instances/store";
import type { CoreStores } from "#wow/session-stores";

export type InstancesActs = Readonly<Record<never, never>>;

export function instancesRuntime(
  _ctx: AreaRuntimeCtx<InstancesEvent>,
  store: InstancesStore,
  core: CoreStores,
): AreaRuntime<InstancesActs> {
  const off = core.self.onEvent((event) => {
    if (event.type === "login_verified" || event.type === "new_world")
      store.mapChanged();
  });
  return { act: {}, dispose: off };
}
