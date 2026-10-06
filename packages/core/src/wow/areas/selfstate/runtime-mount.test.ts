import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  selfstateDismountBody,
  selfstateMountspecialAnimBody,
} from "#test-support/areas/selfstate";
import { UNIT_FLAG_MOUNT } from "#wow/areas/selfstate/fields";
import type { SelfstateEvent } from "#wow/areas/selfstate/store";
import type { Entity } from "#wow/entity-store";
import { ObjectType, UnitFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

const SELF = 0x0e01n;
const OTHER = 0x0e02n;
const FLAGS = UNIT_FIELDS.FLAGS.offset;
const DISPLAY = UNIT_FIELDS.MOUNTDISPLAYID.offset;
const HORSE = 14_337;
const WALKING: [number, number][] = [
  [FLAGS, 0],
  [DISPLAY, 0],
];
const RIDING: [number, number][] = [
  [FLAGS, UNIT_FLAG_MOUNT],
  [DISPLAY, HORSE],
];
const FLYING: [number, number][] = [
  [FLAGS, UNIT_FLAG_MOUNT | UnitFlag.TAXI_FLIGHT],
  [DISPLAY, HORSE],
];

function unit(
  guid: bigint,
  fields: [number, number][],
  objectType: 3 | 4 = ObjectType.PLAYER,
): Entity {
  return {
    entry: 0,
    guid,
    name: undefined,
    objectType,
    position: undefined,
    rawFields: new Map(fields),
    scale: 1,
  };
}

function rigMounted(start: [number, number][] = WALKING) {
  const held = { current: unit(SELF, start) as Entity | undefined };
  const rig = areaRig("selfstate", {
    getEntity: (guid) => (guid === SELF ? held.current : undefined),
    selfGuid: SELF,
  });
  const events: SelfstateEvent[] = [];
  rig.handle.onEvent((event) => events.push(event));
  const update = (entity: Entity) => {
    held.current = entity;
    rig.events.entity.emit({ changed: ["rawFields"], entity, type: "update" });
  };
  const reread = (changed: string) => {
    const entity = held.current;
    if (entity)
      rig.events.entity.emit({ changed: [changed], entity, type: "update" });
  };
  rig.events.entity.emit({ entity: unit(SELF, start), type: "appear" });
  return { events, rig, reread, update };
}

const mountEvents = (events: readonly SelfstateEvent[]) =>
  events.filter((event) => event.type !== "stand_changed");

describe("selfstate runtime: mount fields", () => {
  test("mounted follows the mount flag and display id together, fires on changes only (AC Entities/Unit/Unit.cpp:10223-10230,10283-10290)", () => {
    const { rig, events, update } = rigMounted();
    try {
      expect(rig.handle.state()).toMatchObject({
        mountDisplayId: 0,
        mounted: false,
      });
      update(unit(SELF, [[FLAGS, UNIT_FLAG_MOUNT]]));
      update(unit(SELF, [[DISPLAY, HORSE]]));
      expect(mountEvents(events)).toEqual([]);
      update(unit(SELF, RIDING));
      update(unit(SELF, RIDING));
      expect(rig.handle.state()).toMatchObject({
        mountDisplayId: HORSE,
        mounted: true,
      });
      update(unit(SELF, WALKING));
      expect(rig.handle.state()).toMatchObject({
        mountDisplayId: 0,
        mounted: false,
      });
      expect(mountEvents(events)).toEqual([
        { type: "mounted", displayId: HORSE, taxi: false },
        { type: "dismounted", taxi: false },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a character that logs in mounted holds the state without an event", () => {
    const { rig, events } = rigMounted(RIDING);
    try {
      expect(rig.handle.state()).toMatchObject({
        mountDisplayId: HORSE,
        mounted: true,
      });
      expect(mountEvents(events)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a taxi flight is marked on both events (AC Handlers/TaxiHandler.cpp:119-120)", () => {
    const { rig, events, update } = rigMounted();
    try {
      update(unit(SELF, FLYING));
      update(unit(SELF, WALKING));
      expect(mountEvents(events)).toEqual([
        { type: "mounted", displayId: HORSE, taxi: true },
        { type: "dismounted", taxi: true },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("another guid, or a non-player with the self guid, is not read", () => {
    const { rig, events, update } = rigMounted();
    try {
      update(unit(OTHER, RIDING));
      update(unit(SELF, RIDING, ObjectType.UNIT));
      expect(rig.handle.state().mounted).toBe(false);
      expect(mountEvents(events)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});

describe("selfstate runtime: SMSG_DISMOUNT", () => {
  test("a self dismount clears the state early, and the field update then adds nothing (AC Entities/Unit/Unit.cpp:10301-10303)", () => {
    const { rig, events, update } = rigMounted(RIDING);
    try {
      rig.inject(GameOpcode.SMSG_DISMOUNT, selfstateDismountBody(SELF));
      expect(rig.handle.state()).toMatchObject({
        mountDisplayId: 0,
        mounted: false,
      });
      update(unit(SELF, WALKING));
      expect(mountEvents(events)).toEqual([
        { type: "dismounted", taxi: false },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a name or position reread that still shows the mount before the confirming one adds no mounted event", () => {
    const { rig, events, reread, update } = rigMounted(RIDING);
    try {
      rig.inject(GameOpcode.SMSG_DISMOUNT, selfstateDismountBody(SELF));
      reread("position");
      reread("name");
      expect(rig.handle.state().mounted).toBe(false);
      update(unit(SELF, WALKING));
      reread("position");
      update(unit(SELF, RIDING));
      expect(mountEvents(events)).toEqual([
        { type: "dismounted", taxi: false },
        { type: "mounted", displayId: HORSE, taxi: false },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an authoritative remount on the same display id and taxi bit straight after the dismount is accepted (AC scripts/Spells/spell_item.cpp:3350-3374, Object.cpp:495-513)", () => {
    const { rig, events, update } = rigMounted(RIDING);
    try {
      rig.inject(GameOpcode.SMSG_DISMOUNT, selfstateDismountBody(SELF));
      update(unit(SELF, RIDING));
      expect(rig.handle.state()).toMatchObject({
        mountDisplayId: HORSE,
        mounted: true,
      });
      expect(mountEvents(events)).toEqual([
        { type: "dismounted", taxi: false },
        { type: "mounted", displayId: HORSE, taxi: false },
      ]);
    } finally {
      rig.dispose();
    }
  });
  test("a remount to a different mount straight after the dismount is accepted (AC Entities/Player/Player.cpp:10453, Handlers/TaxiHandler.cpp:119-120)", () => {
    const { rig, events, update } = rigMounted(RIDING);
    try {
      rig.inject(GameOpcode.SMSG_DISMOUNT, selfstateDismountBody(SELF));
      update(
        unit(SELF, [
          [FLAGS, UNIT_FLAG_MOUNT],
          [DISPLAY, HORSE + 1],
        ]),
      );
      expect(rig.handle.state()).toMatchObject({
        mountDisplayId: HORSE + 1,
        mounted: true,
      });
      expect(mountEvents(events)).toEqual([
        { type: "dismounted", taxi: false },
        { type: "mounted", displayId: HORSE + 1, taxi: false },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a taxi flight straight after the dismount sets in_flight even on the same display id", () => {
    const { rig, events, update } = rigMounted(RIDING);
    try {
      rig.inject(GameOpcode.SMSG_DISMOUNT, selfstateDismountBody(SELF));
      update(unit(SELF, FLYING));
      expect(mountEvents(events)).toEqual([
        { type: "dismounted", taxi: false },
        { type: "mounted", displayId: HORSE, taxi: true },
      ]);
      update(unit(SELF, WALKING));
      expect(mountEvents(events).at(-1)).toEqual({
        type: "dismounted",
        taxi: true,
      });
    } finally {
      rig.dispose();
    }
  });

  test("another guid's dismount, and one while on foot, give no event", () => {
    const { rig, events } = rigMounted();
    try {
      rig.inject(GameOpcode.SMSG_DISMOUNT, selfstateDismountBody(SELF));
      rig.inject(GameOpcode.SMSG_DISMOUNT, selfstateDismountBody(OTHER));
      expect(mountEvents(events)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("another guid's dismount leaves a mounted self mounted", () => {
    const { rig, events, update } = rigMounted();
    try {
      update(unit(SELF, RIDING));
      rig.inject(GameOpcode.SMSG_DISMOUNT, selfstateDismountBody(OTHER));
      expect(rig.handle.state().mounted).toBe(true);
      expect(mountEvents(events)).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });
});

describe("selfstate runtime: SMSG_MOUNTSPECIAL_ANIM", () => {
  test("another guid's animation emits mount_anim with its guid (AC Handlers/MovementHandler.cpp:816-822)", () => {
    const { rig, events } = rigMounted();
    try {
      rig.inject(
        GameOpcode.SMSG_MOUNTSPECIAL_ANIM,
        selfstateMountspecialAnimBody(OTHER),
      );
      expect(mountEvents(events)).toEqual([
        { type: "mount_anim", guid: OTHER },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("the self guid gives no event, since the server never relays it back", () => {
    const { rig, events } = rigMounted();
    try {
      rig.inject(
        GameOpcode.SMSG_MOUNTSPECIAL_ANIM,
        selfstateMountspecialAnimBody(SELF),
      );
      expect(mountEvents(events)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});

describe("selfstate runtime: dismount", () => {
  test("on foot it refuses not_mounted and sends nothing (AC Handlers/MiscHandler.cpp:1478-1482)", async () => {
    const { rig } = rigMounted();
    try {
      expect(await rig.handle.act.dismount()).toEqual({
        status: "refused",
        reason: "not_mounted",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("on a taxi flight it refuses in_flight and sends nothing (AC Handlers/MiscHandler.cpp:1484-1488)", async () => {
    const { rig } = rigMounted(FLYING);
    try {
      expect(await rig.handle.act.dismount()).toEqual({
        status: "refused",
        reason: "in_flight",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("sends an empty CMSG_CANCEL_MOUNT_AURA and resolves on the dismount", async () => {
    const { rig, update } = rigMounted(RIDING);
    try {
      const pending = rig.handle.act.dismount();
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_CANCEL_MOUNT_AURA,
          body: new Uint8Array(),
        },
      ]);
      update(unit(SELF, WALKING));
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("the SMSG_DISMOUNT that arrives before the field update also resolves it", async () => {
    const { rig } = rigMounted(RIDING);
    try {
      const pending = rig.handle.act.dismount();
      rig.inject(GameOpcode.SMSG_DISMOUNT, selfstateDismountBody(SELF));
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("no dismount in 2 s settles no_answer", async () => {
    jest.useFakeTimers();
    const { rig } = rigMounted(RIDING);
    try {
      const pending = rig.handle.act.dismount();
      jest.advanceTimersByTime(2000);
      expect(await pending).toEqual({ status: "no_answer" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});

describe("selfstate runtime: mountSpecialAnim", () => {
  test("on foot it refuses not_mounted and sends nothing", () => {
    const { rig } = rigMounted();
    try {
      expect(rig.handle.act.mountSpecialAnim()).toEqual({
        status: "refused",
        reason: "not_mounted",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("mounted it sends the empty CMSG_MOUNTSPECIAL_ANIM (AC Handlers/MovementHandler.cpp:816-822)", () => {
    const { rig } = rigMounted(RIDING);
    try {
      expect(rig.handle.act.mountSpecialAnim()).toEqual({ status: "ok" });
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_MOUNTSPECIAL_ANIM,
          body: new Uint8Array(),
        },
      ]);
    } finally {
      rig.dispose();
    }
  });
});
