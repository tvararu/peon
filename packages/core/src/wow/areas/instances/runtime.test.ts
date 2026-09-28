import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  instancesInstanceDifficultyBody,
  instancesRaidGroupOnlyBody,
} from "#test-support/areas/instances";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import { instancesRuntime } from "#wow/areas/instances/runtime";
import {
  createInstancesStore,
  type InstancesEvent,
} from "#wow/areas/instances/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

const ORGRIMMAR = { mapId: 1, x: 1, y: 2, z: 3, orientation: 0 };
const DEADMINES = { mapId: 36, x: 1, y: 2, z: 3, orientation: 0 };

function armed() {
  const rig = areaRig("instances");
  rig.stores.self.receive({ type: "login_verified", position: DEADMINES });
  rig.inject(
    GameOpcode.SMSG_INSTANCE_DIFFICULTY,
    instancesInstanceDifficultyBody({ difficulty: 1, dynamicHeroic: false }),
  );
  rig.inject(
    GameOpcode.SMSG_RAID_GROUP_ONLY,
    instancesRaidGroupOnlyBody({ timerMs: 60_000, code: 1 }),
  );
  return rig;
}

describe("instances runtime", () => {
  test("a new_world self event clears the per-map state", () => {
    const rig = armed();
    try {
      expect(rig.handle.state().homebindTimer).toBeDefined();
      rig.stores.self.receive({ type: "new_world", position: ORGRIMMAR });
      expect(rig.handle.state()).toMatchObject({
        homebindTimer: undefined,
        mapDifficulty: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("a login_verified self event clears the per-map state and other self events do not", () => {
    const rig = armed();
    try {
      rig.stores.self.receive({ type: "transfer_pending" });
      expect(rig.handle.state().mapDifficulty).toMatchObject({ mapId: 36 });
      rig.stores.self.receive({ type: "login_verified", position: ORGRIMMAR });
      expect(rig.handle.state().mapDifficulty).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("dispose releases the self subscription", () => {
    const off = jest.fn();
    const onEvent = jest.fn(() => off);
    const core = { self: { onEvent } } as unknown as CoreStores;
    const deps = { now: () => 0 } as unknown as SessionDeps;
    const ctx = {} as AreaRuntimeCtx<InstancesEvent>;
    const runtime = instancesRuntime(
      ctx,
      createInstancesStore(deps, core),
      core,
    );
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(off).not.toHaveBeenCalled();
    runtime.dispose();
    expect(off).toHaveBeenCalledTimes(1);
  });
});
