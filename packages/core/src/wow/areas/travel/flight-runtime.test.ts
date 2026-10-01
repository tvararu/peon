import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  travelActivateTaxiReplyBody,
  travelShowTaxiNodesBody,
  travelTaxiDbc,
} from "#test-support/areas/travel";
import {
  buildActivateTaxi,
  buildActivateTaxiExpress,
} from "#wow/areas/travel/protocol";
import type { ControlState } from "#wow/control";
import { GameOpcode } from "#wow/protocol/opcodes";

const TAXI_MASTER = 0xf1_30_00_3d_c1_00_04_57n;

function maskOf(...nodes: number[]): number[] {
  const words = new Array<number>(14).fill(0);
  for (const node of nodes) {
    const word = Math.floor((node - 1) / 32);
    words[word] = ((words[word] ?? 0) | (1 << ((node - 1) % 32))) >>> 0;
  }
  return words;
}

function flightDbc() {
  return travelTaxiDbc({
    nodes: [
      { id: 82, map: 530, x: 0, y: 0, z: 0, name: "Silvermoon City" },
      { id: 83, map: 530, x: 1, y: 1, z: 1, name: "Tranquillien" },
      { id: 200, map: 530, x: 2, y: 2, z: 2, name: "Zul'Aman" },
    ],
    paths: [
      { id: 1, from: 82, to: 83, price: 210 },
      { id: 2, from: 83, to: 82, price: 210 },
      { id: 3, from: 83, to: 200, price: 100 },
      { id: 4, from: 200, to: 82, price: 100 },
      { id: 5, from: 82, to: 200, price: 300 },
    ],
  });
}

function know(rig: { inject: (opcode: number, body: Uint8Array) => void }) {
  rig.inject(
    GameOpcode.SMSG_SHOWTAXINODES,
    travelShowTaxiNodesBody({
      npc: TAXI_MASTER,
      currentNode: 83,
      mask: maskOf(82, 83, 200),
    }),
  );
}

const ROUTE = { nodes: [82, 83], price: 210, destination: 83 };

function poseState(): ControlState {
  return {
    airborne: false,
    blockedReason: undefined,
    input: {},
    mover: undefined,
    movementAllowed: true,
    moving: false,
    pose: {
      mapId: 530,
      orientation: 0,
      source: "server",
      updatedAt: 0,
      x: 1,
      y: 2,
      z: 3,
    },
    requestedTarget: undefined,
    selfGuid: 0n,
    serverPose: undefined,
    speed: 0,
    target: undefined,
  };
}

describe("travel runtime: activateTaxi", () => {
  test("a two-node known route sends CMSG_ACTIVATETAXI and settles ok on ERR_TAXIOK", async () => {
    const rig = areaRig("travel", { dbc: flightDbc() });
    try {
      know(rig);
      const pending = rig.handle.act.activateTaxi(TAXI_MASTER, ROUTE);
      for (let tick = 0; tick < 10 && rig.sent.length === 0; tick++)
        await Promise.resolve();
      expect(rig.sent.at(-1)).toEqual({
        opcode: GameOpcode.CMSG_ACTIVATETAXI,
        body: buildActivateTaxi(TAXI_MASTER, 82, 83),
      });
      rig.inject(
        GameOpcode.SMSG_ACTIVATETAXIREPLY,
        travelActivateTaxiReplyBody(0),
      );
      expect(await pending).toEqual({
        instant: false,
        nodes: [82, 83],
        price: 210,
        status: "ok",
      });
      expect(rig.handle.state().flight.phase).toBe("flying");
    } finally {
      rig.dispose();
    }
  });

  test("a three-node known route sends CMSG_ACTIVATETAXIEXPRESS", async () => {
    const rig = areaRig("travel", { dbc: flightDbc() });
    try {
      know(rig);
      const pending = rig.handle.act.activateTaxi(TAXI_MASTER, {
        nodes: [83, 200, 82],
        price: 200,
        destination: 82,
      });
      for (let tick = 0; tick < 10 && rig.sent.length === 0; tick++)
        await Promise.resolve();
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_ACTIVATETAXIEXPRESS,
          body: buildActivateTaxiExpress(TAXI_MASTER, [83, 200, 82]),
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_ACTIVATETAXIREPLY,
        travelActivateTaxiReplyBody(0),
      );
      expect(await pending).toEqual({
        instant: false,
        nodes: [83, 200, 82],
        price: 200,
        status: "ok",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a refusal code settles refused with the short name (TaxiHandler.cpp:300-305)", async () => {
    const rig = areaRig("travel", { dbc: flightDbc() });
    try {
      know(rig);
      const pending = rig.handle.act.activateTaxi(TAXI_MASTER, ROUTE);
      for (let tick = 0; tick < 10 && rig.sent.length === 0; tick++)
        await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_ACTIVATETAXIREPLY,
        travelActivateTaxiReplyBody(3),
      );
      expect(await pending).toEqual({
        status: "refused",
        reason: "not_enough_money",
      });
      expect(rig.handle.state().flight.phase).toBe("idle");
    } finally {
      rig.dispose();
    }
  });

  test("5 s of silence settles no_answer (Player.cpp:10424-10425,10510-10516)", async () => {
    const rig = areaRig("travel", { dbc: flightDbc() });
    try {
      know(rig);
      const planned = await rig.handle.act.planFlight(83, "Silvermoon City");
      if (planned.status !== "ok") throw new Error("route missing");
      jest.useFakeTimers();
      try {
        const pending = rig.handle.act.activateTaxi(TAXI_MASTER, planned);
        for (let tick = 0; tick < 20; tick++) await Promise.resolve();
        jest.advanceTimersByTime(4999);
        const check = pending.then((outcome) => {
          expect(outcome).toEqual({ status: "no_answer" });
        });
        jest.advanceTimersByTime(1);
        await check;
        expect(rig.handle.state().flight.phase).toBe("idle");
      } finally {
        jest.useRealTimers();
      }
    } finally {
      rig.dispose();
    }
  });

  test("a teleport with no reply inside 5 s settles ok (Player.cpp:10574-10582)", async () => {
    const rig = areaRig("travel", { dbc: flightDbc() });
    try {
      know(rig);
      jest.useFakeTimers();
      try {
        const pending = rig.handle.act.activateTaxi(TAXI_MASTER, ROUTE);
        for (let tick = 0; tick < 20; tick++) await Promise.resolve();
        rig.events.control.emit({
          reason: "teleport",
          state: poseState(),
          type: "server_correction",
        });
        jest.advanceTimersByTime(5000);
        expect(await pending).toEqual({
          instant: true,
          nodes: [82, 83],
          price: 210,
          status: "ok",
        });
      } finally {
        jest.useRealTimers();
      }
    } finally {
      rig.dispose();
    }
  });

  test("refuses before any send: short route, unknown node, broken edge, double flight", async () => {
    const rig = areaRig("travel", { dbc: flightDbc() });
    try {
      know(rig);
      expect(
        await rig.handle.act.activateTaxi(TAXI_MASTER, {
          nodes: [83],
          price: 0,
          destination: 83,
        }),
      ).toEqual({ status: "refused", reason: "no_such_path" });
      expect(
        await rig.handle.act.activateTaxi(TAXI_MASTER, {
          nodes: [83, 999],
          price: 0,
          destination: 999,
        }),
      ).toEqual({ status: "refused", reason: "not_known" });
      expect(
        await rig.handle.act.activateTaxi(TAXI_MASTER, {
          nodes: [82, 200, 83],
          price: 0,
          destination: 83,
        }),
      ).toEqual({ status: "refused", reason: "no_such_path" });
      const first = rig.handle.act.activateTaxi(TAXI_MASTER, ROUTE);
      for (let tick = 0; tick < 20 && rig.sent.length === 0; tick++)
        await Promise.resolve();
      expect(await rig.handle.act.activateTaxi(TAXI_MASTER, ROUTE)).toEqual({
        status: "refused",
        reason: "flight_active",
      });
      expect(rig.sent).toHaveLength(1);
      rig.inject(
        GameOpcode.SMSG_ACTIVATETAXIREPLY,
        travelActivateTaxiReplyBody(12),
      );
      expect(await first).toEqual({
        status: "refused",
        reason: "not_standing",
      });
    } finally {
      rig.dispose();
    }
  });

  test("an unknown node is sent when the known mask is still undefined", async () => {
    const rig = areaRig("travel", { dbc: flightDbc() });
    try {
      const pending = rig.handle.act.activateTaxi(TAXI_MASTER, {
        nodes: [83, 200],
        price: 100,
        destination: 200,
      });
      for (let tick = 0; tick < 10 && rig.sent.length === 0; tick++)
        await Promise.resolve();
      expect(rig.sent.at(-1)?.opcode).toBe(GameOpcode.CMSG_ACTIVATETAXI);
      rig.inject(
        GameOpcode.SMSG_ACTIVATETAXIREPLY,
        travelActivateTaxiReplyBody(6),
      );
      expect(await pending).toEqual({
        status: "refused",
        reason: "not_visited",
      });
    } finally {
      rig.dispose();
    }
  });

  test("unchecked sends a node outside the known mask as express", async () => {
    const rig = areaRig("travel", { dbc: flightDbc() });
    try {
      rig.inject(
        GameOpcode.SMSG_SHOWTAXINODES,
        travelShowTaxiNodesBody({
          npc: TAXI_MASTER,
          currentNode: 83,
          mask: maskOf(83),
        }),
      );
      const pending = rig.handle.act.activateTaxi(
        TAXI_MASTER,
        { nodes: [83, 200], price: 0, destination: 200 },
        { express: true, unchecked: true },
      );
      for (let tick = 0; tick < 10 && rig.sent.length === 0; tick++)
        await Promise.resolve();
      expect(rig.sent.at(-1)).toEqual({
        opcode: GameOpcode.CMSG_ACTIVATETAXIEXPRESS,
        body: buildActivateTaxiExpress(TAXI_MASTER, [83, 200]),
      });
      rig.inject(
        GameOpcode.SMSG_ACTIVATETAXIREPLY,
        travelActivateTaxiReplyBody(6),
      );
      expect(await pending).toEqual({
        status: "refused",
        reason: "not_visited",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a send that throws releases the reply waiter and rejects the caller", async () => {
    const rig = areaRig("travel", { dbc: flightDbc() });
    const sent = rig.sent as unknown as { push: (...items: never[]) => number };
    const push = sent.push;
    try {
      know(rig);
      jest.useFakeTimers();
      try {
        sent.push = () => {
          throw new Error("World socket is not connected");
        };
        await expect(
          rig.handle.act.activateTaxi(TAXI_MASTER, ROUTE),
        ).rejects.toThrow("World socket is not connected");
        expect(rig.handle.state().flight.phase).toBe("idle");
        const pendingTimers = jest.getTimerCount();
        expect(pendingTimers).toBe(0);
        sent.push = push;
        const retry = rig.handle.act.activateTaxi(TAXI_MASTER, ROUTE);
        for (let tick = 0; tick < 10 && rig.sent.length === 0; tick++)
          await Promise.resolve();
        expect(jest.getTimerCount()).toBe(1);
        rig.inject(
          GameOpcode.SMSG_ACTIVATETAXIREPLY,
          travelActivateTaxiReplyBody(0),
        );
        expect(await retry).toEqual({
          instant: false,
          nodes: [82, 83],
          price: 210,
          status: "ok",
        });
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    } finally {
      sent.push = push;
      rig.dispose();
    }
  });

  test("two activations without an await send one packet (TaxiHandler.cpp:272-278)", async () => {
    const rig = areaRig("travel", { dbc: flightDbc() });
    try {
      know(rig);
      const first = rig.handle.act.activateTaxi(TAXI_MASTER, ROUTE);
      const second = rig.handle.act.activateTaxi(TAXI_MASTER, ROUTE);
      for (let tick = 0; tick < 20 && rig.sent.length === 0; tick++)
        await Promise.resolve();
      expect(rig.sent).toHaveLength(1);
      rig.inject(
        GameOpcode.SMSG_ACTIVATETAXIREPLY,
        travelActivateTaxiReplyBody(0),
      );
      const outcomes = await Promise.all([first, second]);
      expect(
        outcomes.filter((outcome) => outcome.status === "ok"),
      ).toHaveLength(1);
      expect(outcomes).toContainEqual({
        status: "refused",
        reason: "flight_active",
      });
    } finally {
      rig.dispose();
    }
  });

  test("dispose during the catalog load sends no packet (Player.cpp:10424-10425)", async () => {
    const files = new Map<string, Uint8Array>();
    const resolvers = Promise.withResolvers<Map<string, Uint8Array>>();
    const deferred = (file: string): Promise<Uint8Array> => {
      if (file === "TaxiNodes.dbc")
        return resolvers.promise.then(
          () => files.get(file) ?? new Uint8Array(),
        );
      const real = flightDbc();
      return real(file);
    };
    const rig = areaRig("travel", { dbc: deferred });
    try {
      const pending = rig.handle.act.activateTaxi(TAXI_MASTER, ROUTE);
      for (let tick = 0; tick < 10; tick++) await Promise.resolve();
      rig.dispose();
      resolvers.resolve(files);
      await expect(pending).rejects.toThrow("borted");
      expect(rig.sent).toHaveLength(0);
      expect(rig.handle.state().flight.phase).toBe("idle");
    } finally {
      resolvers.resolve(files);
      rig.dispose();
    }
  });

  test("dispose aborts a flight wait and returns the phase to idle", async () => {
    const rig = areaRig("travel", { dbc: flightDbc() });
    try {
      know(rig);
      const pending = rig.handle.act.activateTaxi(TAXI_MASTER, ROUTE);
      for (let tick = 0; tick < 10 && rig.sent.length === 0; tick++)
        await Promise.resolve();
      rig.dispose();
      await expect(pending).rejects.toThrow("aborted");
      expect(rig.handle.state().flight.phase).toBe("idle");
    } finally {
      rig.dispose();
    }
  });
});
