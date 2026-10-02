import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  objectsAreaTriggerBody,
  objectsAreaTriggerDbc,
  objectsAreaTriggerMessageBody,
  objectsGameObjUseBody,
  objectsPageTextQueryResponseBody,
} from "#test-support/areas/objects";
import { dbcFiles } from "#test-support/dbc";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { EntityStore } from "#test-support/internals";
import { testStores } from "#test-support/session-fixtures";
import { createModuleRuntimes, looseModule } from "#wow/areas/compose";
import type { AreaTrigger } from "#wow/areas/objects/trigger-catalog";
import { testPort } from "#wow/areas/port";
import { AREAS } from "#wow/areas/registry";
import type { ControlEventType, ControlState } from "#wow/control";
import type { Position } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";

const USE_GUID = 0xf1_10_2c_14_00_00_52_80n;
const USE_ENTRY = 180_516;
const QUEST_ENTRY = 188_089;
const QUEST_GUID = 0xf1_10_46_df_00_00_05_e3n;

function worldWith(guid: bigint, entry: number, type: number) {
  const world = new EntityStore();
  world.create(guid, ObjectType.GAMEOBJECT, {
    entry,
    gameObjectType: type,
  } as never);
  const clock = { now: 1000 };
  const port = testPort({ now: () => clock.now });
  const core = testStores({
    getEntity: (at) => world.get(at),
    now: () => clock.now,
    send: port.send,
  });
  const module = looseModule(AREAS["objects"]);
  const lifetime = createModuleRuntimes(
    port,
    [module],
    { objects: core.areas.objects },
    core,
  );
  const acts = lifetime.runtimes["objects"]?.act as {
    use: (target: bigint) => unknown;
  };
  return { acts, clock, core, dispose: () => lifetime.dispose(), port };
}

describe("objects runtime use", () => {
  test("use sends a use then a report use and records the pending use", () => {
    const { acts, core, dispose, port } = worldWith(USE_GUID, USE_ENTRY, 10);
    try {
      const events: unknown[] = [];
      core.areas.objects.onEvent((event) => events.push(event));
      expect(acts.use(USE_GUID)).toEqual({
        ok: true,
        record: { entry: USE_ENTRY, guid: USE_GUID },
      });
      expect(port.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_GAMEOBJ_USE,
        GameOpcode.CMSG_GAMEOBJ_REPORT_USE,
      ]);
      expect(port.sent[0]?.body).toEqual(objectsGameObjUseBody(USE_GUID));
      expect(port.sent[1]?.body).toEqual(objectsGameObjUseBody(USE_GUID));
      expect(core.areas.objects.snapshot().pendingUse).toEqual({
        entry: USE_ENTRY,
        expired: false,
        guid: USE_GUID,
        sentAt: 1000,
      });
      expect(events).toEqual([
        { entry: USE_ENTRY, guid: USE_GUID, how: "use", type: "used" },
      ]);
      expect(core.quests.snapshot().pending).toBeUndefined();
    } finally {
      dispose();
    }
  });

  test("use of an unknown object sends nothing", () => {
    const { acts, dispose, port } = worldWith(USE_GUID, USE_ENTRY, 10);
    try {
      expect(acts.use(0xf1_10_99_99_00_00_00_01n)).toEqual({
        ok: false,
        reason: "unknown",
      });
      expect(port.sent).toEqual([]);
    } finally {
      dispose();
    }
  });

  test("use of a quest giver object records the talk intent first", () => {
    const { acts, core, dispose } = worldWith(QUEST_GUID, QUEST_ENTRY, 2);
    try {
      expect(acts.use(QUEST_GUID)).toEqual({
        ok: true,
        record: { entry: QUEST_ENTRY, guid: QUEST_GUID },
      });
      expect(core.quests.snapshot().pending).toMatchObject({
        action: "talk",
        guid: QUEST_GUID,
      });
    } finally {
      dispose();
    }
  });

  test("the pending use reads expired 5 s after it was sent", () => {
    const { acts, clock, core, dispose } = worldWith(USE_GUID, USE_ENTRY, 10);
    try {
      acts.use(USE_GUID);
      clock.now = 5999;
      expect(core.areas.objects.snapshot().pendingUse?.expired).toBe(false);
      clock.now = 6000;
      expect(core.areas.objects.snapshot().pendingUse?.expired).toBe(true);
    } finally {
      dispose();
    }
  });
});

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
const DEADMINES: AreaTrigger = {
  ...FARGODEEP,
  id: 78,
  x: -11_208.5,
  y: 1685.34,
  z: 25.76,
  radius: 7,
};
const INSIDE: Position = {
  mapId: 0,
  x: -9843.54,
  y: 120.525,
  z: 5.37,
  orientation: 0,
};
const OUTSIDE: Position = { ...INSIDE, y: 100 };
const LEVEL = "You must be at least level 10 to enter.";

function state(pose: Position): ControlState {
  return {
    selfGuid: 1n,
    pose: { ...pose, source: "predicted", updatedAt: 0 },
    serverPose: undefined,
    target: undefined,
    requestedTarget: undefined,
    moving: true,
    input: {},
    airborne: false,
    movementAllowed: true,
    blockedReason: undefined,
    speed: 7,
    mover: undefined,
  };
}

async function rigWith(triggers?: readonly AreaTrigger[]) {
  const dbc =
    triggers &&
    dbcFiles(new Map([["AreaTrigger.dbc", objectsAreaTriggerDbc(triggers)]]));
  const rig = areaRig("objects", { dbc });
  for (let i = 0; i < 20; i++) {
    if (rig.handle.state().triggers.catalog !== "loading") break;
    await Bun.sleep(0);
  }
  const control = (type: ControlEventType, pose: Position, reason?: string) =>
    rig.events.control.emit({ type, state: state(pose), reason });
  const triggersSent = () =>
    rig.sent.filter((p) => p.opcode === GameOpcode.CMSG_AREATRIGGER);
  return { control, rig, triggersSent };
}

describe("objects runtime area triggers", () => {
  test("a pose_sent that enters trigger 88 sends CMSG_AREATRIGGER once", async () => {
    const { rig, control, triggersSent } = await rigWith([FARGODEEP]);
    try {
      const events: unknown[] = [];
      rig.handle.onEvent((event) => events.push(event));
      expect(rig.handle.state().triggers.catalog).toBe("ready");
      control("pose_sent", OUTSIDE);
      control("pose_sent", INSIDE);
      control("pose_sent", { ...INSIDE, y: 124 });
      expect(triggersSent()).toEqual([
        {
          opcode: GameOpcode.CMSG_AREATRIGGER,
          body: objectsAreaTriggerBody(88),
        },
      ]);
      expect(events).toEqual([{ type: "trigger_sent", triggerId: 88, map: 0 }]);
    } finally {
      rig.dispose();
    }
  });

  test("a teleport into a trigger marks it inside without a send", async () => {
    const { rig, control, triggersSent } = await rigWith([FARGODEEP]);
    try {
      control("pose_sent", OUTSIDE);
      control("server_correction", INSIDE, "teleport");
      control("pose_sent", INSIDE);
      expect(triggersSent()).toEqual([]);
      expect(rig.handle.state().triggers.inside).toEqual([88]);
      control("pose_sent", OUTSIDE);
      control("pose_sent", INSIDE);
      expect(triggersSent()).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("new_world and login_verified mark the arrival point inside", async () => {
    const { rig, control, triggersSent } = await rigWith([
      FARGODEEP,
      DEADMINES,
    ]);
    try {
      rig.stores.self.receive({ type: "login_verified", position: INSIDE });
      control("pose_sent", INSIDE);
      const deadmines = { ...INSIDE, x: -11_208.5, y: 1685.34, z: 25.76 };
      rig.stores.self.receive({ type: "new_world", position: deadmines });
      control("pose_sent", deadmines);
      expect(triggersSent()).toEqual([]);
      expect(rig.handle.state().triggers.inside).toEqual([78]);
    } finally {
      rig.dispose();
    }
  });

  test("a server correction that is not a teleport does not mark the trigger", async () => {
    const { rig, control, triggersSent } = await rigWith([FARGODEEP]);
    try {
      control("pose_sent", OUTSIDE);
      control("server_correction", INSIDE, "observed");
      control("pose_sent", INSIDE);
      expect(triggersSent()).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("enterTrigger sends the trigger and names the current map", async () => {
    const { rig, triggersSent } = await rigWith();
    try {
      rig.stores.self.receive({
        type: "login_verified",
        position: { ...INSIDE, mapId: 36 },
      });
      const events: unknown[] = [];
      rig.handle.onEvent((event) => events.push(event));
      rig.handle.act.enterTrigger(78);
      expect(triggersSent()).toEqual([
        {
          opcode: GameOpcode.CMSG_AREATRIGGER,
          body: objectsAreaTriggerBody(78),
        },
      ]);
      expect(events).toEqual([
        { type: "trigger_sent", triggerId: 78, map: 36 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("without AreaTrigger.dbc the watcher stays off", async () => {
    const { rig, control, triggersSent } = await rigWith();
    try {
      control("pose_sent", OUTSIDE);
      control("pose_sent", INSIDE);
      expect(triggersSent()).toEqual([]);
      expect(rig.handle.state().triggers.catalog).toBe("none");
    } finally {
      rig.dispose();
    }
  });

  test("a missing AreaTrigger.dbc marks the catalog failed", async () => {
    const rig = areaRig("objects", { dbc: dbcFiles(new Map()) });
    try {
      for (let i = 0; i < 20; i++) await Bun.sleep(0);
      expect(rig.handle.state().triggers.catalog).toBe("failed");
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_AREA_TRIGGER_MESSAGE keeps the text and emits trigger_message", async () => {
    const { rig } = await rigWith();
    try {
      const events: unknown[] = [];
      rig.handle.onEvent((event) => events.push(event));
      rig.inject(
        GameOpcode.SMSG_AREA_TRIGGER_MESSAGE,
        objectsAreaTriggerMessageBody(LEVEL),
      );
      expect(rig.handle.state().lastMessage?.text).toBe(LEVEL);
      expect(events).toEqual([{ type: "trigger_message", text: LEVEL }]);
    } finally {
      rig.dispose();
    }
  });

  test("dispose stops the watcher", async () => {
    const { rig, control, triggersSent } = await rigWith([FARGODEEP]);
    control("pose_sent", OUTSIDE);
    rig.dispose();
    control("pose_sent", INSIDE);
    expect(triggersSent()).toEqual([]);
  });
});

describe("objects runtime page text", () => {
  test("readPage resolves once with the chained pages (QueryHandler.cpp:367, :391)", async () => {
    const { rig } = await rigWith();
    try {
      const events: unknown[] = [];
      rig.handle.onEvent((event) => events.push(event));
      const pending = rig.handle.act.readPage(2936);
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_PAGE_TEXT_QUERY,
      ]);
      rig.inject(
        GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
        objectsPageTextQueryResponseBody(2936, "First page.", 2937),
      );
      rig.inject(
        GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
        objectsPageTextQueryResponseBody(2937, "Second page.", 0),
      );
      const outcome = await pending;
      expect(outcome).toEqual({
        firstPageId: 2936,
        pages: [
          { pageId: 2936, text: "First page." },
          { pageId: 2937, text: "Second page." },
        ],
      });
      expect(events).toEqual([{ type: "page_read", ...outcome }]);
      expect(rig.sent.length).toBe(1);
    } finally {
      rig.dispose();
    }
  });

  test("readPage sends nothing for a cached chain (QueryHandler.cpp:367)", async () => {
    const { rig } = await rigWith();
    try {
      const first = rig.handle.act.readPage(2936);
      rig.inject(
        GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
        objectsPageTextQueryResponseBody(2936, "First page.", 0),
      );
      await first;
      const before = rig.sent.length;
      await expect(rig.handle.act.readPage(2936)).resolves.toEqual({
        firstPageId: 2936,
        pages: [{ pageId: 2936, text: "First page." }],
      });
      expect(rig.sent.length).toBe(before);
    } finally {
      rig.dispose();
    }
  });

  test("readPage of a missing chain stops at the missing reply (QueryHandler.cpp:374-379)", async () => {
    const { rig } = await rigWith();
    try {
      const pending = rig.handle.act.readPage(2_147_483_647);
      rig.inject(
        GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
        objectsPageTextQueryResponseBody(
          2_147_483_647,
          "Item page missing.",
          0,
        ),
      );
      await expect(pending).resolves.toEqual({
        firstPageId: 2_147_483_647,
        pages: [{ pageId: 2_147_483_647, text: "Item page missing." }],
      });
    } finally {
      rig.dispose();
    }
  });

  test("readPage reads thirty sequential pages then stops (QueryHandler.cpp:367)", async () => {
    const { rig } = await rigWith();
    try {
      const pending = rig.handle.act.readPage(100);
      for (let pageId = 100; pageId < 130; pageId++)
        rig.inject(
          GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE,
          objectsPageTextQueryResponseBody(
            pageId,
            `Page ${pageId}.`,
            pageId + 1,
          ),
        );
      const outcome = await pending;
      expect(outcome).toMatchObject({ firstPageId: 100 });
      expect("pages" in outcome && outcome.pages).toHaveLength(30);
    } finally {
      rig.dispose();
    }
  });

  test("readPage without a reply times out after 5 s and emits page_unanswered", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("objects");
      try {
        const events: unknown[] = [];
        rig.handle.onEvent((event) => events.push(event));
        const pending = rig.handle.act.readPage(2936);
        await elapse(5000);
        await expect(pending).resolves.toEqual({ pageId: 2936 });
        expect(events).toEqual([{ type: "page_unanswered", pageId: 2936 }]);
      } finally {
        rig.dispose();
      }
    });
  });
});
