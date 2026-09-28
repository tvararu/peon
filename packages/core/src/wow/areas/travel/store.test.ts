import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  travelBinderConfirmBody,
  travelBindPointUpdateBody,
  travelPlayerBoundBody,
} from "#test-support/areas/travel";
import { areaStubs } from "#wow/areas/compose";
import type { TravelEvent } from "#wow/areas/travel/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const INNKEEPER = 0xf1_30_00_3e_4a_00_12_34n;
const HOME = { mapId: 530, x: 9477.5, y: -6857.25, z: 16.5, areaId: 3665 };
const NEW_HOME = { mapId: 530, x: 9500, y: -6800, z: 20, areaId: 3487 };

function rigAt(start = 1000) {
  let t = start;
  const rig = areaRig("travel", { now: () => t });
  const seen: TravelEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return {
    advance: (ms: number) => {
      t += ms;
    },
    rig,
    seen,
  };
}

describe("travel store", () => {
  test("starts with no home, offer or bind", () => {
    const { rig } = rigAt();
    try {
      expect(rig.handle.state()).toEqual({
        home: undefined,
        offer: undefined,
        lastBound: undefined,
        bindPending: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("a bind point update with no bind pending sets home and emits bind_point for login", () => {
    const { rig, seen } = rigAt();
    try {
      rig.inject(
        GameOpcode.SMSG_BINDPOINTUPDATE,
        travelBindPointUpdateBody(HOME),
      );
      expect(rig.handle.state().home).toEqual(HOME);
      expect(seen).toEqual([{ type: "bind_point", reason: "login", ...HOME }]);
    } finally {
      rig.dispose();
    }
  });

  test("a binder confirm records the offer until the next bind point update", () => {
    const { rig, seen, advance } = rigAt();
    try {
      rig.inject(
        GameOpcode.SMSG_BINDER_CONFIRM,
        travelBinderConfirmBody(INNKEEPER),
      );
      expect(rig.handle.state().offer).toEqual({ npc: INNKEEPER, at: 1000 });
      expect(seen).toEqual([{ type: "bind_offer", npc: INNKEEPER }]);
      advance(5000);
      rig.inject(
        GameOpcode.SMSG_BINDPOINTUPDATE,
        travelBindPointUpdateBody(NEW_HOME),
      );
      expect(rig.handle.state().offer).toBeUndefined();
      expect(rig.handle.state().home).toEqual(NEW_HOME);
    } finally {
      rig.dispose();
    }
  });

  test("an offer older than 60 s reads as absent", () => {
    const { rig, advance } = rigAt();
    try {
      rig.inject(
        GameOpcode.SMSG_BINDER_CONFIRM,
        travelBinderConfirmBody(INNKEEPER),
      );
      advance(60_000);
      expect(rig.handle.state().offer).toEqual({ npc: INNKEEPER, at: 1000 });
      advance(1);
      expect(rig.handle.state().offer).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("a player-bound packet records the binder and emits bound", () => {
    const { rig, seen } = rigAt();
    try {
      rig.inject(
        GameOpcode.SMSG_PLAYERBOUND,
        travelPlayerBoundBody({ binder: INNKEEPER, areaId: 3487 }),
      );
      expect(rig.handle.state().lastBound).toEqual({
        binder: INNKEEPER,
        areaId: 3487,
        at: 1000,
      });
      expect(seen).toEqual([
        { type: "bound", binder: INNKEEPER, areaId: 3487 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a bind point update while a bind is pending emits bind_point for the bind", () => {
    const { rig, seen } = rigAt();
    try {
      rig.stores.areas.travel.beginBind(INNKEEPER);
      expect(rig.handle.state().bindPending).toBe(INNKEEPER);
      rig.inject(
        GameOpcode.SMSG_BINDPOINTUPDATE,
        travelBindPointUpdateBody(NEW_HOME),
      );
      expect(seen).toEqual([
        { type: "bind_point", reason: "bound", ...NEW_HOME },
      ]);
      rig.stores.areas.travel.endBind();
      expect(rig.handle.state().bindPending).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("the snapshot is detached from the store", () => {
    const { rig } = rigAt();
    try {
      rig.inject(
        GameOpcode.SMSG_BINDPOINTUPDATE,
        travelBindPointUpdateBody(HOME),
      );
      const state = rig.handle.state();
      if (!state.home) throw new Error("no home");
      state.home.x = 0;
      expect(rig.handle.state().home).toEqual(HOME);
    } finally {
      rig.dispose();
    }
  });

  test("the area owns SMSG_BINDPOINTUPDATE and no longer stubs it", () => {
    const { rig } = rigAt();
    try {
      expect(rig.dispatch.has(GameOpcode.SMSG_BINDPOINTUPDATE)).toBe(true);
      expect(
        areaStubs().some(
          ([opcode]) => opcode === GameOpcode.SMSG_BINDPOINTUPDATE,
        ),
      ).toBe(false);
    } finally {
      rig.dispose();
    }
  });
});
