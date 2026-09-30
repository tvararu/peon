import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  travelBindPointUpdateBody,
  travelPlayerBoundBody,
  travelShowTaxiNodesBody,
  travelTaxiDbc,
  travelTaxiNodeStatusBody,
} from "#test-support/areas/travel";
import {
  buildBinderActivate,
  buildEnableTaxi,
  buildSetTaxiBenchmarkMode,
  buildTaxiNodeStatusQuery,
  buildTaxiQueryAvailableNodes,
} from "#wow/areas/travel/protocol";
import { registerTrainerHandlers } from "#wow/gameplay-handlers";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";
import type { WorldConn } from "#wow/world-conn";

const INNKEEPER = 0xf1_30_00_3e_4a_00_12_34n;
const TRAINER = 0xf1_30_00_3d_c1_00_00_77n;
const BIND_SPELL = 3286;
const HOME = { mapId: 530, x: 9500, y: -6800, z: 20, areaId: 3487 };

function binds(sent: readonly { opcode: number }[]) {
  return sent.filter((p) => p.opcode === GameOpcode.CMSG_BINDER_ACTIVATE);
}

function buySucceeded(guid: bigint, spellId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  w.uint32LE(spellId);
  return w.finish();
}

describe("travel runtime: bindActivate", () => {
  test("sends CMSG_BINDER_ACTIVATE with the npc guid and settles ok on the new bind point", async () => {
    const rig = areaRig("travel");
    try {
      const pending = rig.handle.act.bindActivate(INNKEEPER);
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_BINDER_ACTIVATE,
          body: buildBinderActivate(INNKEEPER),
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_BINDPOINTUPDATE,
        travelBindPointUpdateBody(HOME),
      );
      rig.inject(
        GameOpcode.SMSG_PLAYERBOUND,
        travelPlayerBoundBody({ binder: INNKEEPER, areaId: HOME.areaId }),
      );
      expect(await pending).toEqual({ status: "ok", home: HOME });
      expect(rig.handle.state()).toMatchObject({
        home: HOME,
        bindPending: undefined,
        lastBound: { binder: INNKEEPER, areaId: HOME.areaId },
      });
    } finally {
      rig.dispose();
    }
  });

  test("settles no_answer after 5 s of silence and clears the pending bind (NPCHandler.cpp:298-307,317-319)", async () => {
    jest.useFakeTimers();
    const rig = areaRig("travel");
    try {
      const pending = rig.handle.act.bindActivate(INNKEEPER);
      jest.advanceTimersByTime(4999);
      expect(rig.handle.state().bindPending).toBe(INNKEEPER);
      jest.advanceTimersByTime(1);
      expect(await pending).toEqual({ status: "no_answer" });
      expect(rig.handle.state().bindPending).toBeUndefined();
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a second bind while one is pending refuses busy and sends nothing", async () => {
    const rig = areaRig("travel");
    try {
      const first = rig.handle.act.bindActivate(INNKEEPER);
      expect(await rig.handle.act.bindActivate(INNKEEPER)).toEqual({
        status: "refused",
        reason: "busy",
      });
      expect(binds(rig.sent)).toHaveLength(1);
      rig.inject(
        GameOpcode.SMSG_BINDPOINTUPDATE,
        travelBindPointUpdateBody(HOME),
      );
      expect(await first).toMatchObject({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("dispose rejects a pending bind with the abort reason", async () => {
    const rig = areaRig("travel");
    const pending = rig.handle.act.bindActivate(INNKEEPER);
    rig.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  test("the bind's SMSG_TRAINER_BUY_SUCCEEDED for spell 3286 is no purchase for a pending train (NPCHandler.cpp:321-331, trainer-store.ts:106-112)", () => {
    const rig = areaRig("travel", {
      register: (dispatch, stores) =>
        registerTrainerHandlers({ dispatch } as unknown as WorldConn, stores),
    });
    try {
      rig.stores.trainer.begin({
        action: "train",
        guid: TRAINER,
        spellId: 133,
        cost: 100,
        coinageBefore: 1000,
        learnedBefore: [],
        succeeded: false,
        requestedAt: 0,
      });
      rig.inject(
        GameOpcode.SMSG_TRAINER_BUY_SUCCEEDED,
        buySucceeded(INNKEEPER, BIND_SPELL),
      );
      expect(rig.stores.trainer.pending).toMatchObject({ succeeded: false });
      expect(rig.stores.trainer.snapshot().lastOutcome).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});

const TAXI_MASTER = 0xf1_30_00_3d_c1_00_04_57n;
const OTHER_MASTER = 0xf1_30_00_3d_c1_00_09_11n;

function maskOf(...nodes: number[]): number[] {
  const words = new Array<number>(14).fill(0);
  for (const node of nodes) {
    const word = Math.floor((node - 1) / 32);
    words[word] = ((words[word] ?? 0) | (1 << ((node - 1) % 32))) >>> 0;
  }
  return words;
}

function taxiDbc() {
  return travelTaxiDbc({
    nodes: [
      { id: 82, map: 530, x: 9411.31, y: -7278.72, z: 15.9, name: "Silvermoon City" },
      { id: 83, map: 530, x: 7535.26, y: -6812.75, z: 84.92, name: "Tranquillien" },
    ],
    paths: [
      { id: 1, from: 82, to: 83, price: 210 },
      { id: 2, from: 83, to: 82, price: 210 },
    ],
  });
}

describe("travel runtime: taxi", () => {
  test("queryTaxiStatus sends the query and settles ok on the status for that npc", async () => {
    const rig = areaRig("travel");
    try {
      const pending = rig.handle.act.queryTaxiStatus(TAXI_MASTER);
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_TAXINODE_STATUS_QUERY,
          body: buildTaxiNodeStatusQuery(TAXI_MASTER),
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_TAXINODE_STATUS,
        travelTaxiNodeStatusBody({ npc: TAXI_MASTER, known: true }),
      );
      expect(await pending).toEqual({ status: "ok", known: true });
    } finally {
      rig.dispose();
    }
  });

  test("queryTaxiStatus of 3 s of silence gives no_answer (TaxiHandler.cpp:35-51)", async () => {
    jest.useFakeTimers();
    const rig = areaRig("travel");
    try {
      const pending = rig.handle.act.queryTaxiStatus(TAXI_MASTER);
      jest.advanceTimersByTime(2999);
      jest.advanceTimersByTime(1);
      expect(await pending).toEqual({ status: "no_answer" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a second status query while one is pending refuses busy and sends nothing", async () => {
    const rig = areaRig("travel");
    try {
      const first = rig.handle.act.queryTaxiStatus(TAXI_MASTER);
      expect(await rig.handle.act.queryTaxiStatus(OTHER_MASTER)).toEqual({
        status: "refused",
        reason: "busy",
      });
      expect(rig.sent).toHaveLength(1);
      rig.inject(
        GameOpcode.SMSG_TAXINODE_STATUS,
        travelTaxiNodeStatusBody({ npc: TAXI_MASTER, known: false }),
      );
      expect(await first).toEqual({ status: "ok", known: false });
    } finally {
      rig.dispose();
    }
  });

  test("openTaxiMap sends the query and settles map on SMSG_SHOWTAXINODES", async () => {
    const rig = areaRig("travel");
    try {
      const pending = rig.handle.act.openTaxiMap(TAXI_MASTER);
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_TAXIQUERYAVAILABLENODES,
          body: buildTaxiQueryAvailableNodes(TAXI_MASTER),
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_SHOWTAXINODES,
        travelShowTaxiNodesBody({ npc: TAXI_MASTER, currentNode: 83, mask: maskOf(82, 83) }),
      );
      expect(await pending).toEqual({
        status: "ok",
        kind: "map",
        currentNode: 83,
        known: [82, 83],
      });
    } finally {
      rig.dispose();
    }
  });

  test("openTaxiMap settles learned on SMSG_NEW_TAXI_PATH at an unknown node", async () => {
    const rig = areaRig("travel");
    try {
      const pending = rig.handle.act.openTaxiMap(TAXI_MASTER);
      rig.inject(GameOpcode.SMSG_NEW_TAXI_PATH, new Uint8Array(0));
      expect(await pending).toEqual({ status: "ok", kind: "learned" });
      expect(rig.handle.state().learnedAt).toBe(0);
    } finally {
      rig.dispose();
    }
  });

  test("openTaxiMap with enable sends CMSG_ENABLETAXI (Opcodes.cpp:1302)", async () => {
    const rig = areaRig("travel");
    try {
      const pending = rig.handle.act.openTaxiMap(TAXI_MASTER, { enable: true });
      expect(rig.sent).toEqual([
        { opcode: GameOpcode.CMSG_ENABLETAXI, body: buildEnableTaxi(TAXI_MASTER) },
      ]);
      rig.inject(GameOpcode.SMSG_NEW_TAXI_PATH, new Uint8Array(0));
      expect(await pending).toEqual({ status: "ok", kind: "learned" });
    } finally {
      rig.dispose();
    }
  });

  test("openTaxiMap of 3 s of silence gives no_answer (TaxiHandler.cpp:66-71)", async () => {
    jest.useFakeTimers();
    const rig = areaRig("travel");
    try {
      const pending = rig.handle.act.openTaxiMap(TAXI_MASTER);
      jest.advanceTimersByTime(3000);
      expect(await pending).toEqual({ status: "no_answer" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("setTaxiBenchmark sends one u8 and settles on the benchmark event", async () => {
    const rig = areaRig("travel");
    try {
      const pending = rig.handle.act.setTaxiBenchmark(true);
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_SET_TAXI_BENCHMARK_MODE,
          body: buildSetTaxiBenchmarkMode(true),
        },
      ]);
      rig.stores.areas.travel.receiveSelfFlags(true);
      expect(await pending).toEqual({ status: "ok", on: true });
    } finally {
      rig.dispose();
    }
  });

  test("setTaxiBenchmark(false) on an already-false state settles ok without waiting", async () => {
    const rig = areaRig("travel");
    try {
      expect(await rig.handle.act.setTaxiBenchmark(false)).toEqual({
        status: "ok",
        on: false,
      });
      expect(rig.sent).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("setTaxiBenchmark of 3 s of silence gives no_answer", async () => {
    jest.useFakeTimers();
    const rig = areaRig("travel");
    try {
      const pending = rig.handle.act.setTaxiBenchmark(true);
      jest.advanceTimersByTime(3000);
      expect(await pending).toEqual({ status: "no_answer" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("destinations lists direct edges from the node with names and prices", async () => {
    const rig = areaRig("travel", { dbc: taxiDbc() });
    try {
      rig.inject(
        GameOpcode.SMSG_SHOWTAXINODES,
        travelShowTaxiNodesBody({ npc: TAXI_MASTER, currentNode: 82, mask: maskOf(82, 83) }),
      );
      expect(await rig.handle.act.destinations(82)).toEqual({
        status: "ok",
        from: 82,
        list: [{ node: 83, name: "Tranquillien", price: 210, known: true }],
      });
    } finally {
      rig.dispose();
    }
  });

  test("destinations refuses unknown_node, and planFlight matches by case-insensitive name part", async () => {
    const rig = areaRig("travel", { dbc: taxiDbc() });
    try {
      rig.inject(
        GameOpcode.SMSG_SHOWTAXINODES,
        travelShowTaxiNodesBody({ npc: TAXI_MASTER, currentNode: 82, mask: maskOf(82, 83) }),
      );
      expect(await rig.handle.act.destinations(999)).toEqual({
        status: "refused",
        reason: "unknown_node",
      });
      expect(await rig.handle.act.planFlight(82, "tranquillien")).toEqual({
        status: "ok",
        nodes: [82, 83],
        price: 210,
        destination: 83,
      });
    } finally {
      rig.dispose();
    }
  });

  test("planFlight refuses ambiguous with the matches, not_known and no_route", async () => {
    const rig = areaRig("travel", { dbc: taxiDbc() });
    try {
      rig.inject(
        GameOpcode.SMSG_SHOWTAXINODES,
        travelShowTaxiNodesBody({ npc: TAXI_MASTER, currentNode: 82, mask: maskOf(82) }),
      );
      expect(await rig.handle.act.planFlight(82, "zzz")).toEqual({
        status: "refused",
        reason: "unknown_node",
      });
      const ambiguous = await rig.handle.act.planFlight(82, "n");
      expect(ambiguous).toEqual({ status: "refused", reason: "ambiguous" });
      expect(await rig.handle.act.planFlight(82, "Tranquillien")).toEqual({
        status: "refused",
        reason: "not_known",
      });
    } finally {
      rig.dispose();
    }
  });

  test("planFlight with no route over known nodes refuses no_route", async () => {
    const rig = areaRig("travel", {
      dbc: travelTaxiDbc({
        nodes: [
          { id: 82, map: 530, x: 0, y: 0, z: 0, name: "Silvermoon City" },
          { id: 83, map: 530, x: 1, y: 1, z: 1, name: "Tranquillien" },
        ],
        paths: [],
      }),
    });
    try {
      rig.inject(
        GameOpcode.SMSG_SHOWTAXINODES,
        travelShowTaxiNodesBody({ npc: TAXI_MASTER, currentNode: 82, mask: maskOf(82, 83) }),
      );
      expect(await rig.handle.act.planFlight(82, "Tranquillien")).toEqual({
        status: "refused",
        reason: "no_route",
      });
    } finally {
      rig.dispose();
    }
  });

  test("destinations and planFlight refuse missing_taxi_data with no dbc", async () => {
    const rig = areaRig("travel");
    try {
      expect(await rig.handle.act.destinations(82)).toEqual({
        status: "refused",
        reason: "missing_taxi_data",
      });
      expect(await rig.handle.act.planFlight(82, "Tranquillien")).toEqual({
        status: "refused",
        reason: "missing_taxi_data",
      });
    } finally {
      rig.dispose();
    }
  });
});
