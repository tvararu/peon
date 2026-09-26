import { describe, expect, test } from "bun:test";
import { startMockWorldServer } from "#test-support/mock-world-server";
import {
  base,
  fakeAuth,
  waitForEchoProbe,
} from "#test-support/world-handlers-fixtures";
import { type WorldHandle, worldSession } from "#wow/client";
import { areaName } from "#wow/client-place";
import type { ControlEvent } from "#wow/control";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";

type Place = { mapId: number; zoneId: number; areaId: number };

const sunstrider: Place = { mapId: 530, zoneId: 3430, areaId: 3431 };
const goldshire: Place = { mapId: 0, zoneId: 12, areaId: 87 };
const nowhere: Place = { mapId: 1, zoneId: 999_999, areaId: 999_998 };

function worldStates({ mapId, zoneId, areaId }: Place): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(mapId);
  w.uint32LE(zoneId);
  w.uint32LE(areaId);
  w.uint16LE(1);
  w.uint32LE(3191);
  w.uint32LE(1);
  return w.finish();
}

function nextPlaceChange(handle: WorldHandle): Promise<ControlEvent> {
  const { promise, resolve } = Promise.withResolvers<ControlEvent>();
  const off = handle.onControlEvent((event) => {
    if (event.type !== "place_changed") return;
    off();
    resolve(event);
  });
  return promise;
}

function placeChanges(handle: WorldHandle): ControlEvent[] {
  const seen: ControlEvent[] = [];
  handle.onControlEvent((event) => {
    if (event.type === "place_changed") seen.push(event);
  });
  return seen;
}

async function session() {
  const server = await startMockWorldServer({ coalesceSelfCreate: true });
  const handle = await worldSession(
    { ...base, host: "127.0.0.1", port: server.port },
    fakeAuth(server.port),
  );
  await waitForEchoProbe(handle);
  return { handle, server };
}

describe("place state", () => {
  test("is empty before the first world states packet", async () => {
    const { server, handle } = await session();
    try {
      expect(handle.getPlaceState()).toEqual({
        mapId: undefined,
        zoneId: undefined,
        areaId: undefined,
        zone: undefined,
        area: undefined,
        at: undefined,
      });
    } finally {
      handle.close();
      await handle.closed;
      server.stop();
    }
  });

  test("names the zone and area from the packet", async () => {
    const { server, handle } = await session();
    try {
      const changed = nextPlaceChange(handle);
      server.inject(GameOpcode.SMSG_INIT_WORLD_STATES, worldStates(sunstrider));
      const event = await changed;
      expect(event.state.selfGuid).toBe(handle.getControlState().selfGuid);
      expect(handle.getPlaceState()).toMatchObject({
        mapId: 530,
        zoneId: 3430,
        areaId: 3431,
        zone: "Eversong Woods",
        area: "Sunstrider Isle",
      });
      expect(handle.getPlaceState().at).toBeNumber();
    } finally {
      handle.close();
      await handle.closed;
      server.stop();
    }
  });

  test("emits place_changed only when the place differs", async () => {
    const { server, handle } = await session();
    try {
      const seen = placeChanges(handle);
      const first = nextPlaceChange(handle);
      server.inject(GameOpcode.SMSG_INIT_WORLD_STATES, worldStates(sunstrider));
      await first;
      const second = nextPlaceChange(handle);
      server.inject(GameOpcode.SMSG_INIT_WORLD_STATES, worldStates(sunstrider));
      server.inject(GameOpcode.SMSG_INIT_WORLD_STATES, worldStates(goldshire));
      await second;
      expect(seen).toHaveLength(2);
      expect(handle.getPlaceState()).toMatchObject({
        zone: "Elwynn Forest",
        area: "Goldshire",
      });
    } finally {
      handle.close();
      await handle.closed;
      server.stop();
    }
  });

  test("leaves unknown ids without a name", async () => {
    const { server, handle } = await session();
    try {
      const changed = nextPlaceChange(handle);
      server.inject(GameOpcode.SMSG_INIT_WORLD_STATES, worldStates(nowhere));
      await changed;
      expect(handle.getPlaceState()).toMatchObject({
        zoneId: 999_999,
        areaId: 999_998,
        zone: undefined,
        area: undefined,
      });
    } finally {
      handle.close();
      await handle.closed;
      server.stop();
    }
  });

  test("returns a copy, not the stored state", async () => {
    const { server, handle } = await session();
    try {
      const changed = nextPlaceChange(handle);
      server.inject(GameOpcode.SMSG_INIT_WORLD_STATES, worldStates(goldshire));
      await changed;
      const place = handle.getPlaceState();
      place.zone = "changed";
      expect(handle.getPlaceState().zone).toBe("Elwynn Forest");
    } finally {
      handle.close();
      await handle.closed;
      server.stop();
    }
  });
});

describe("areaName", () => {
  test("reads the generated table", () => {
    expect(areaName(3430)).toBe("Eversong Woods");
    expect(areaName(3433)).toBe("Ghostlands");
    expect(areaName(12)).toBe("Elwynn Forest");
    expect(areaName(0)).toBeUndefined();
  });
});
