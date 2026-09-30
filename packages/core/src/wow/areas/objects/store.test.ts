import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  objectsGameObjectPageTextBody,
  objectsGameObjectQueryMissingBody,
  objectsGameObjectQueryResponseBody,
  objectsPageTextQueryResponseBody,
} from "#test-support/areas/objects";
import { testStores } from "#test-support/session-fixtures";
import { ObjectsStore, PAGE_READ_MAX_PAGES } from "#wow/areas/objects/store";
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

describe("ObjectsStore page text", () => {
  test("one query answers a two-page chain with one packet per page (QueryHandler.cpp:367, :391)", async () => {
    const rig = areaRig("objects");
    try {
      const pending = rig.handle.act.readPage(2936);
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_PAGE_TEXT_QUERY,
      ]);
      const events: unknown[] = [];
      rig.stores.areas.objects.onEvent((event) => events.push(event));
      rig.inject(
        GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
        objectsPageTextQueryResponseBody(2936, "First page.", 2937),
      );
      rig.inject(
        GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
        objectsPageTextQueryResponseBody(2937, "Second page.", 0),
      );
      await expect(pending).resolves.toEqual({
        firstPageId: 2936,
        pages: [
          { pageId: 2936, text: "First page." },
          { pageId: 2937, text: "Second page." },
        ],
      });
      expect(events).toEqual([
        {
          type: "page_read",
          firstPageId: 2936,
          pages: [
            { pageId: 2936, text: "First page." },
            { pageId: 2937, text: "Second page." },
          ],
        },
      ]);
      expect(rig.handle.state().pages.get(2936)).toEqual([
        { pageId: 2936, text: "First page." },
        { pageId: 2937, text: "Second page." },
      ]);
      expect(rig.sent.length).toBe(1);
    } finally {
      rig.dispose();
    }
  });

  test("a cached chain sends nothing (QueryHandler.cpp:367)", async () => {
    const rig = areaRig("objects");
    try {
      const first = rig.handle.act.readPage(2936);
      rig.inject(
        GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
        objectsPageTextQueryResponseBody(2936, "First page.", 0),
      );
      await first;
      const events: unknown[] = [];
      rig.stores.areas.objects.onEvent((event) => events.push(event));
      const before = rig.sent.length;
      await expect(rig.handle.act.readPage(2936)).resolves.toEqual({
        firstPageId: 2936,
        pages: [{ pageId: 2936, text: "First page." }],
      });
      expect(rig.sent.length).toBe(before);
      expect(events).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a shown page reports the object guid and the template page id (GameObject.cpp:1632)", () => {
    const SHRINE = 0xf1_10_2c_14_00_00_52_80n;
    const rig = areaRig("objects", {
      getEntity: (guid) =>
        guid === SHRINE
          ? ({
              entry: 192_709,
              guid,
              objectType: 5,
            } as never)
          : undefined,
    });
    try {
      rig.inject(
        GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE,
        objectsGameObjectQueryResponseBody({
          data: [0, 0, 0, 0, 0, 0, 0, 2936],
          displayId: 3012,
          entry: 192_709,
          name: "The Schools of Arcane Magic - Abjuration",
          type: 10,
        }),
      );
      const events: unknown[] = [];
      rig.stores.areas.objects.onEvent((event) => events.push(event));
      rig.inject(
        GameOpcode.SMSG_GAMEOBJECT_PAGETEXT,
        objectsGameObjectPageTextBody(SHRINE),
      );
      expect(events).toEqual([
        { type: "page_shown", guid: SHRINE, pageId: 2936 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a chain that reaches a cached page appends the cached pages (QueryHandler.cpp:391)", async () => {
    const rig = areaRig("objects");
    try {
      const second = rig.handle.act.readPage(2937);
      rig.inject(
        GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
        objectsPageTextQueryResponseBody(2937, "Second page.", 0),
      );
      await second;
      const first = rig.handle.act.readPage(2936);
      rig.inject(
        GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
        objectsPageTextQueryResponseBody(2936, "First page.", 2937),
      );
      await expect(first).resolves.toEqual({
        firstPageId: 2936,
        pages: [
          { pageId: 2936, text: "First page." },
          { pageId: 2937, text: "Second page." },
        ],
      });
    } finally {
      rig.dispose();
    }
  });

  test("an appended cached suffix stops at the page cap (QueryHandler.cpp:391)", async () => {
    const rig = areaRig("objects");
    try {
      const cached = rig.handle.act.readPage(2);
      for (let pageId = 2; pageId <= PAGE_READ_MAX_PAGES + 1; pageId++)
        rig.inject(
          GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
          objectsPageTextQueryResponseBody(
            pageId,
            `Page ${pageId}.`,
            pageId + 1,
          ),
        );
      await expect(cached).resolves.toMatchObject({
        pages: { length: PAGE_READ_MAX_PAGES },
      });
      const first = rig.handle.act.readPage(1);
      rig.inject(
        GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
        objectsPageTextQueryResponseBody(1, "Page 1.", 2),
      );
      const chain = Array.from({ length: PAGE_READ_MAX_PAGES }, (_, index) => ({
        pageId: index + 1,
        text: `Page ${index + 1}.`,
      }));
      await expect(first).resolves.toEqual({ firstPageId: 1, pages: chain });
    } finally {
      rig.dispose();
    }
  });

  test("one reply completes every open chain that waits for it (QueryHandler.cpp:391)", async () => {
    const rig = areaRig("objects");
    try {
      const first = rig.handle.act.readPage(2936);
      const second = rig.handle.act.readPage(2937);
      const events: unknown[] = [];
      rig.stores.areas.objects.onEvent((event) => events.push(event));
      rig.inject(
        GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
        objectsPageTextQueryResponseBody(2936, "First page.", 2937),
      );
      rig.inject(
        GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
        objectsPageTextQueryResponseBody(2937, "Second page.", 0),
      );
      rig.inject(
        GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
        objectsPageTextQueryResponseBody(2937, "Second page.", 0),
      );
      await expect(first).resolves.toEqual({
        firstPageId: 2936,
        pages: [
          { pageId: 2936, text: "First page." },
          { pageId: 2937, text: "Second page." },
        ],
      });
      await expect(second).resolves.toEqual({
        firstPageId: 2937,
        pages: [{ pageId: 2937, text: "Second page." }],
      });
      expect(events.length).toBe(2);
    } finally {
      rig.dispose();
    }
  });

  test("a page shown before its template arrives is reported once the template lands (GameObject.cpp:1632)", () => {
    const SHRINE = 0xf1_10_2c_14_00_00_52_80n;
    const rig = areaRig("objects", {
      getEntity: (guid) =>
        guid === SHRINE
          ? ({ entry: 192_709, guid, objectType: 5 } as never)
          : undefined,
    });
    try {
      const events: unknown[] = [];
      rig.stores.areas.objects.onEvent((event) => events.push(event));
      rig.inject(
        GameOpcode.SMSG_GAMEOBJECT_PAGETEXT,
        objectsGameObjectPageTextBody(SHRINE),
      );
      expect(events).toEqual([]);
      rig.inject(
        GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE,
        objectsGameObjectQueryResponseBody({
          data: [0, 0, 0, 0, 0, 0, 0, 2936],
          displayId: 3012,
          entry: 192_709,
          name: "The Schools of Arcane Magic - Abjuration",
          type: 10,
        }),
      );
      expect(events).toEqual([
        { type: "page_shown", guid: SHRINE, pageId: 2936 },
      ]);
    } finally {
      rig.dispose();
    }
  });
});

describe("ObjectsStore triggersNear", () => {
  test("lists triggers on the map nearest first within the radius, and none before the catalog loads", () => {
    const { store } = build();
    expect(store.triggersNear(0, -9843, 92, 100)).toEqual([]);
    const far: AreaTrigger = { ...FARGODEEP, id: 7, y: 200 };
    const other: AreaTrigger = { ...FARGODEEP, id: 9, map: 1 };
    store.useTriggers(new AreaTriggerCatalog([far, FARGODEEP, other]));
    expect(store.triggersNear(0, -9843, 92, 150).map((t) => t.id)).toEqual([
      88, 7,
    ]);
    expect(store.triggersNear(0, -9843, 92, 50).map((t) => t.id)).toEqual([88]);
    expect(store.triggersNear(0, -9843, 92, 50)[0]?.z).toBe(FARGODEEP.z);
    expect(store.triggersNear(1, -9843, 92, 100).map((t) => t.id)).toEqual([9]);
  });
});
