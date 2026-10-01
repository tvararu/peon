import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  travelActivateTaxiReplyBody,
  travelBinderConfirmBody,
  travelBindPointUpdateBody,
  travelPlayerBoundBody,
  travelShowTaxiNodesBody,
  travelTaxiNodeStatusBody,
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
        known: undefined,
        masters: [],
        learnedAt: undefined,
        mapPending: undefined,
        benchmark: false,
        lastReply: undefined,
        flight: { phase: "idle", route: undefined },
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

const TAXI_MASTER = 0xf1_30_00_3d_c1_00_04_57n;

function maskOf(...nodes: number[]): number[] {
  const words = new Array<number>(14).fill(0);
  for (const node of nodes) {
    const word = Math.floor((node - 1) / 32);
    words[word] = ((words[word] ?? 0) | (1 << ((node - 1) % 32))) >>> 0;
  }
  return words;
}

describe("travel store: taxi", () => {
  test("a taxi map sets known, the master node and emits taxi_map; a stub saw the legacy body first", () => {
    let legacy: { prefix: number; npc: bigint } | undefined;
    const rig = areaRig("travel", {
      register: (dispatch) => {
        dispatch.on(GameOpcode.SMSG_SHOWTAXINODES, (r) => {
          legacy = { prefix: r.uint32LE(), npc: r.uint64LE() };
        });
      },
    });
    const seen: TravelEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(
        GameOpcode.SMSG_SHOWTAXINODES,
        travelShowTaxiNodesBody({
          npc: TAXI_MASTER,
          currentNode: 83,
          mask: maskOf(82, 83),
        }),
      );
      expect(legacy).toEqual({ prefix: 1, npc: TAXI_MASTER });
      expect(rig.handle.state().known).toEqual([82, 83]);
      expect(rig.handle.state().masters).toEqual([
        { npc: TAXI_MASTER, node: 83, known: undefined },
      ]);
      expect(seen).toEqual([
        { type: "taxi_map", npc: TAXI_MASTER, currentNode: 83, knownCount: 2 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("known is undefined until the first map", () => {
    const { rig } = rigAt();
    try {
      expect(rig.handle.state().known).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("a node status sets the master known flag and emits taxi_node_status", () => {
    const { rig, seen } = rigAt();
    try {
      rig.inject(
        GameOpcode.SMSG_TAXINODE_STATUS,
        travelTaxiNodeStatusBody({ npc: TAXI_MASTER, known: true }),
      );
      expect(rig.handle.state().masters).toEqual([
        { npc: TAXI_MASTER, node: undefined, known: true },
      ]);
      expect(seen).toEqual([
        { type: "taxi_node_status", npc: TAXI_MASTER, known: true },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a new taxi path sets learnedAt and emits taxi_node_learned with the pending map npc", () => {
    const { rig, seen, advance } = rigAt();
    try {
      rig.stores.areas.travel.beginMap(TAXI_MASTER);
      advance(250);
      rig.inject(GameOpcode.SMSG_NEW_TAXI_PATH, new Uint8Array(0));
      expect(rig.handle.state().learnedAt).toBe(1250);
      expect(seen).toEqual([{ type: "taxi_node_learned", npc: TAXI_MASTER }]);
    } finally {
      rig.dispose();
    }
  });

  test("a new taxi path without a pending map request emits taxi_node_learned with no npc", () => {
    const { rig, seen } = rigAt();
    try {
      rig.inject(GameOpcode.SMSG_NEW_TAXI_PATH, new Uint8Array(0));
      expect(seen).toEqual([{ type: "taxi_node_learned", npc: undefined }]);
    } finally {
      rig.dispose();
    }
  });

  test("a self update gaining PLAYER_FLAGS 0x20000 sets benchmark and emits it", () => {
    const me = 0xf1_00_00_3e_4a_00_12_34n;
    const rig = areaRig("travel", {
      selfGuid: me,
      getEntity: () => ({
        guid: me,
        objectType: 4,
        entry: 0,
        scale: 0,
        position: undefined,
        rawFields: new Map([[59, 0x2_00_00]]),
        name: undefined,
        createComplete: true,
      }),
    });
    const seen: TravelEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.stores.areas.travel.receiveSelfFlags(true);
      expect(rig.handle.state().benchmark).toBe(true);
      expect(seen).toEqual([{ type: "benchmark", on: true }]);
    } finally {
      rig.dispose();
    }
  });
});

describe("travel store: flight", () => {
  test("an activate with ERR_TAXIOK sets lastReply, flies and emits taxi_reply then flight_started", () => {
    const { rig, seen } = rigAt();
    try {
      rig.stores.areas.travel.beginFlight([83, 82]);
      rig.inject(
        GameOpcode.SMSG_ACTIVATETAXIREPLY,
        travelActivateTaxiReplyBody(0),
      );
      expect(rig.handle.state().lastReply).toBe("ok");
      expect(rig.handle.state().flight).toEqual({
        phase: "flying",
        route: [83, 82],
      });
      expect(seen).toEqual([
        { type: "taxi_reply", code: 0, name: "ok" },
        { type: "flight_started", route: [83, 82] },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a refusal sets lastReply and emits taxi_reply without flying", () => {
    const { rig, seen } = rigAt();
    try {
      rig.inject(
        GameOpcode.SMSG_ACTIVATETAXIREPLY,
        travelActivateTaxiReplyBody(3),
      );
      expect(rig.handle.state().lastReply).toBe("not_enough_money");
      expect(rig.handle.state().flight.phase).toBe("idle");
      expect(seen).toEqual([
        { type: "taxi_reply", code: 3, name: "not_enough_money" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("after ERR_TAXIOK a stale self spline position with old flags does not land", () => {
    const { rig, seen } = rigAt();
    try {
      rig.stores.areas.travel.beginFlight([83, 82]);
      rig.inject(
        GameOpcode.SMSG_ACTIVATETAXIREPLY,
        travelActivateTaxiReplyBody(0),
      );
      rig.stores.areas.travel.receiveFlightFlag(false);
      expect(rig.handle.state().flight.phase).toBe("flying");
      rig.stores.areas.travel.receiveFlightFlag(true);
      rig.stores.areas.travel.receiveFlightFlag(true);
      expect(rig.handle.state().flight.phase).toBe("flying");
      rig.stores.areas.travel.receiveFlightFlag(false);
      expect(rig.handle.state().flight.phase).toBe("landed");
      expect(seen).toEqual([
        { type: "taxi_reply", code: 0, name: "ok" },
        { type: "flight_started", route: [83, 82] },
        { type: "flight_landed" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a self flight flag enters flying from idle and its clear lands", () => {
    const { rig, seen } = rigAt();
    try {
      rig.stores.areas.travel.receiveFlightFlag(true);
      expect(rig.handle.state().flight.phase).toBe("flying");
      rig.stores.areas.travel.receiveFlightFlag(false);
      expect(rig.handle.state().flight.phase).toBe("landed");
      rig.stores.areas.travel.receiveFlightFlag(false);
      expect(rig.handle.state().flight.phase).toBe("landed");
      expect(seen).toEqual([
        { type: "flight_started", route: [] },
        { type: "flight_landed" },
      ]);
    } finally {
      rig.dispose();
    }
  });
});
