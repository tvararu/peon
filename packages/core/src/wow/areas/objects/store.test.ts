import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  objectsGameObjectQueryMissingBody,
  objectsGameObjectQueryResponseBody,
} from "#test-support/areas/objects";
import { testStores } from "#test-support/session-fixtures";
import { ObjectsStore } from "#wow/areas/objects/store";
import { lockId } from "#wow/areas/objects/templates";
import {
  type AreaTrigger,
  AreaTriggerCatalog,
} from "#wow/areas/objects/trigger-catalog";
import type { Entity } from "#wow/entity-store";
import { UnitFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { SessionDeps } from "#wow/session-stores";

const SELF = 0x42n;
const FARGODEEP: AreaTrigger = {
  id: 88,
  map: 0,
  x: -9843.54,
  y: 127.525,
  z: 5.37,
  radius: 10,
  length: 0,
  width: 0,
  height: 0,
  orientation: 0,
};
const INSIDE = { mapId: 0, x: -9843.54, y: 120.525, z: 5.37 };
const OUTSIDE = { mapId: 0, x: -9843.54, y: 100, z: 5.37 };

function build(unitFlags?: () => number) {
  const deps: SessionDeps = {
    getEntity: (guid) =>
      guid === SELF && unitFlags
        ? ({ guid, unitFlags: unitFlags() } as unknown as Entity)
        : undefined,
    now: () => 7,
    selfGuid: () => SELF,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  const store = new ObjectsStore(deps, testStores());
  const events: unknown[] = [];
  store.onEvent((event) => events.push(event));
  return { events, store };
}

describe("ObjectsStore triggers", () => {
  test("moves before the catalog is ready enter nothing, and the catalog marks the last point inside", () => {
    const { store } = build();
    store.loadingTriggers();
    expect(store.move(INSIDE)).toEqual([]);
    expect(store.snapshot().triggers).toMatchObject({
      catalog: "loading",
      inside: [],
    });
    store.useTriggers(new AreaTriggerCatalog([FARGODEEP]));
    expect(store.snapshot().triggers).toMatchObject({
      catalog: "ready",
      inside: [88],
    });
    expect(store.move(INSIDE)).toEqual([]);
  });

  test("entering returns the trigger and noteSent records it with trigger_sent", () => {
    const { store, events } = build();
    store.useTriggers(new AreaTriggerCatalog([FARGODEEP]));
    store.move(OUTSIDE);
    expect(store.move(INSIDE)).toEqual([88]);
    store.noteSent(88, 0);
    expect(events).toEqual([{ type: "trigger_sent", triggerId: 88, map: 0 }]);
    expect(store.snapshot().triggers).toMatchObject({
      inside: [88],
      sent: [88],
    });
  });

  test("the self unit's taxi flag holds every send", () => {
    let flags: number = UnitFlag.TAXI_FLIGHT;
    const { store } = build(() => flags);
    store.useTriggers(new AreaTriggerCatalog([FARGODEEP]));
    store.move(OUTSIDE);
    expect(store.move(INSIDE)).toEqual([]);
    flags = 0;
    store.move(OUTSIDE);
    expect(store.move(INSIDE)).toEqual([88]);
  });

  test("a trigger message is kept and emitted", () => {
    const { store, events } = build();
    store.message({ text: "You must be at least level 10 to enter." });
    expect(store.snapshot().lastMessage).toEqual({
      text: "You must be at least level 10 to enter.",
      at: 7,
    });
    expect(events).toEqual([
      {
        type: "trigger_message",
        text: "You must be at least level 10 to enter.",
      },
    ]);
  });

  test("a failed catalog load shows in the state", () => {
    const { store } = build();
    store.loadingTriggers();
    store.triggersFailed();
    expect(store.snapshot().triggers.catalog).toBe("failed");
    expect(store.move(INSIDE)).toEqual([]);
  });
});

describe("ObjectsStore templates", () => {
  test("keeps each game object template the server sends (QueryHandler.cpp:194-211, gameobject_template.sql:6262)", () => {
    const rig = areaRig("objects");
    try {
      rig.inject(
        GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE,
        objectsGameObjectQueryResponseBody({
          data: [43, 10_119, 0, 1],
          displayId: 3012,
          entry: 161_557,
          name: "Milly's Harvest",
          questItems: [11_119],
          size: 1,
          type: 3,
        }),
      );
      const template = rig.handle.state().templates.get(161_557);
      expect(template && lockId(template)).toBe(43);
      expect(template).toMatchObject({
        lockId: 43,
        name: "Milly's Harvest",
        questItems: [11_119],
        type: 3,
      });
    } finally {
      rig.dispose();
    }
  });

  test("the masked reply for a missing entry stores nothing (QueryHandler.cpp:220)", () => {
    const rig = areaRig("objects");
    try {
      rig.inject(
        GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE,
        objectsGameObjectQueryMissingBody(161_557),
      );
      expect(rig.handle.state().templates.size).toBe(0);
    } finally {
      rig.dispose();
    }
  });
});
