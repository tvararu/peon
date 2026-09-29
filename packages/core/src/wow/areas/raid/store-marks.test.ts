import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  raidGroupLeftBody,
  raidGroupListBody,
  raidMinimapPingBody,
  raidTargetListBody,
  raidTargetSetBody,
} from "#test-support/areas/raid";
import type { RaidEvent } from "#wow/areas/raid/store-roster";
import { GameOpcode } from "#wow/protocol/opcodes";

const PEON = 0x30n;
const TOM = 0x10n;
const LYNX = 0xf130000123000045n;
const BOAR = 0xf130000123000046n;

function rigWithGroup() {
  const rig = areaRig("raid", { selfGuid: PEON });
  const events: RaidEvent[] = [];
  rig.handle.onEvent((event) => {
    events.push(event);
  });
  rig.inject(
    GameOpcode.SMSG_GROUP_LIST,
    raidGroupListBody({
      counter: 1,
      leader: TOM,
      members: [
        { guid: PEON, name: "Peon" },
        { guid: TOM, name: "Tom" },
      ],
      type: 0,
    }),
  );
  events.length = 0;
  return { events, rig };
}

type Rig = ReturnType<typeof rigWithGroup>["rig"];

function set(rig: Rig, who: bigint, icon: number, target: bigint) {
  rig.inject(
    GameOpcode.MSG_RAID_TARGET_UPDATE,
    raidTargetSetBody(who, icon, target),
  );
}

describe("raid marks store", () => {
  test("a set updates one slot and emits raid_mark with the setter name", () => {
    const { events, rig } = rigWithGroup();
    try {
      set(rig, TOM, 7, LYNX);
      expect(events).toEqual([
        { icon: 7, name: "Tom", target: LYNX, type: "raid_mark", who: TOM },
      ]);
      const marks = rig.handle.state().marks ?? [];
      expect(marks).toHaveLength(8);
      expect(marks[7]).toBe(LYNX);
      expect(marks.filter((guid) => guid !== 0n)).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("a set of a marked target clears its old slot", () => {
    const { rig } = rigWithGroup();
    try {
      set(rig, TOM, 7, LYNX);
      set(rig, TOM, 3, LYNX);
      const marks = rig.handle.state().marks ?? [];
      expect(marks[3]).toBe(LYNX);
      expect(marks[7]).toBe(0n);
    } finally {
      rig.dispose();
    }
  });

  test("a move as the server sends it ends with the target in the new slot", () => {
    const { events, rig } = rigWithGroup();
    try {
      set(rig, TOM, 7, LYNX);
      events.length = 0;
      set(rig, 0n, 7, 0n);
      set(rig, TOM, 3, LYNX);
      const marks = rig.handle.state().marks ?? [];
      expect(marks[3]).toBe(LYNX);
      expect(marks[7]).toBe(0n);
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        target: 0n,
        type: "raid_mark",
        who: 0n,
      });
    } finally {
      rig.dispose();
    }
  });

  test("target 0 clears the slot", () => {
    const { events, rig } = rigWithGroup();
    try {
      set(rig, TOM, 7, LYNX);
      events.length = 0;
      set(rig, TOM, 7, 0n);
      expect(rig.handle.state().marks?.[7]).toBe(0n);
      expect(events).toMatchObject([
        { target: 0n, type: "raid_mark", who: TOM },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an icon past the eight slots is dropped", () => {
    const { events, rig } = rigWithGroup();
    try {
      set(rig, TOM, 8, LYNX);
      expect(events).toEqual([]);
      expect(rig.handle.state().marks?.every((guid) => guid === 0n)).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  test("a setter outside the roster has an empty name", () => {
    const { events, rig } = rigWithGroup();
    try {
      set(rig, 0x99n, 1, LYNX);
      expect(events).toMatchObject([{ name: "", type: "raid_mark" }]);
    } finally {
      rig.dispose();
    }
  });

  test("the list replaces all eight slots and emits raid_marks", () => {
    const { events, rig } = rigWithGroup();
    try {
      set(rig, TOM, 7, LYNX);
      events.length = 0;
      rig.inject(
        GameOpcode.MSG_RAID_TARGET_UPDATE,
        raidTargetListBody([
          { icon: 0, target: BOAR },
          { icon: 4, target: LYNX },
        ]),
      );
      const expected = [BOAR, 0n, 0n, 0n, LYNX, 0n, 0n, 0n];
      expect(rig.handle.state().marks).toEqual(expected);
      expect(events).toEqual([{ marks: expected, type: "raid_marks" }]);
    } finally {
      rig.dispose();
    }
  });

  test("an empty list clears every slot", () => {
    const { events, rig } = rigWithGroup();
    try {
      set(rig, TOM, 7, LYNX);
      events.length = 0;
      rig.inject(GameOpcode.MSG_RAID_TARGET_UPDATE, raidTargetListBody([]));
      expect(rig.handle.state().marks?.every((guid) => guid === 0n)).toBe(true);
      expect(events).toMatchObject([{ type: "raid_marks" }]);
    } finally {
      rig.dispose();
    }
  });

  test("a disband clears the marks", () => {
    const { rig } = rigWithGroup();
    try {
      set(rig, TOM, 7, LYNX);
      rig.inject(GameOpcode.SMSG_GROUP_LIST, raidGroupLeftBody(2));
      expect(rig.handle.state().marks?.every((guid) => guid === 0n)).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  test("a ping emits minimap_ping with who, name and position", () => {
    const { events, rig } = rigWithGroup();
    try {
      rig.inject(
        GameOpcode.MSG_MINIMAP_PING,
        raidMinimapPingBody(TOM, -9464.5, 62.25),
      );
      expect(events).toEqual([
        { name: "Tom", type: "minimap_ping", who: TOM, x: -9464.5, y: 62.25 },
      ]);
    } finally {
      rig.dispose();
    }
  });
});
