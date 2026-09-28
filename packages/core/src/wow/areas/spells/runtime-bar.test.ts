import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import type { UnitEntity } from "#wow/entity-store";
import type { ActionButton } from "#wow/protocol/action-buttons";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";

const ME = 0x2an;
const FIREBALL = 133;
const HEARTHSTONE = 6948;
const FIELD_BYTES = PLAYER_FIELDS.FEATURES.offset;

type Button = Omit<ActionButton, "slot">;

function self(fields: Record<number, number>): UnitEntity {
  return {
    class_: 8,
    displayId: 1,
    entry: 0,
    factionTemplate: 1,
    gender: 0,
    guid: ME,
    health: 200,
    level: 10,
    maxHealth: 200,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "Mage",
    npcFlags: 0,
    objectType: ObjectType.PLAYER,
    position: undefined,
    power: [0, 0, 0, 0, 0, 0, 0],
    race: 10,
    rawFields: new Map(Object.entries(fields).map(([k, v]) => [Number(k), v])),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function setup() {
  const rig = areaRig("spells", { selfGuid: ME });
  rig.stores.combat.applyLearned({ spellId: FIREBALL });
  return { rig };
}

function decodeButton(body: Uint8Array) {
  const r = new PacketReader(body);
  const slot = r.uint8();
  const packed = r.uint32LE();
  return { packed, rest: r.remaining, slot };
}

describe("spells action bar acts", () => {
  test("setActionButton sends one CMSG_SET_ACTION_BUTTON and sets the bar store (MiscHandler.cpp:899-938)", () => {
    const { rig } = setup();
    try {
      expect(
        rig.handle.act.setActionButton(0, { id: FIREBALL, type: "spell" }),
      ).toEqual({ ok: true });
      expect(rig.sent.map((p) => p.opcode)).toEqual([
        GameOpcode.CMSG_SET_ACTION_BUTTON,
      ]);
      expect(decodeButton(rig.sent[0]?.body ?? new Uint8Array())).toEqual({
        packed: FIREBALL,
        rest: 0,
        slot: 0,
      });
      expect(rig.stores.actionBar.snapshot()).toEqual([
        { id: FIREBALL, slot: 0, type: "spell" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("setActionButton with no button clears the slot with 0 (MiscHandler.cpp:909-913)", () => {
    const { rig } = setup();
    try {
      rig.handle.act.setActionButton(11, { id: HEARTHSTONE, type: "item" });
      expect(rig.handle.act.setActionButton(11, undefined)).toEqual({
        ok: true,
      });
      expect(decodeButton(rig.sent[1]?.body ?? new Uint8Array())).toEqual({
        packed: 0,
        rest: 0,
        slot: 11,
      });
      expect(rig.stores.actionBar.snapshot()).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test.each([
    ["slot 144 (Player.cpp:5762-5766)", 144, { id: FIREBALL, type: "spell" }],
    ["slot -1", -1, { id: FIREBALL, type: "spell" }],
    ["slot 1.5", 1.5, { id: FIREBALL, type: "spell" }],
    [
      "id 0x1000000 (Player.cpp:5768-5772)",
      0,
      { id: 0x1_00_00_00, type: "item" },
    ],
    ["id 0", 0, { id: 0, type: "item" }],
    [
      "an unlearned spell (Player.cpp:5783-5787)",
      0,
      { id: 168, type: "spell" },
    ],
    ["an unknown type (MiscHandler.cpp:931-934)", 0, { id: 1, type: "flyout" }],
  ] as const)(
    "setActionButton refuses %s with invalid_button and sends nothing",
    (_, slot, button) => {
      const { rig } = setup();
      try {
        expect(
          rig.handle.act.setActionButton(slot, button as unknown as Button),
        ).toEqual({ ok: false, reason: "invalid_button" });
        expect(rig.sent).toEqual([]);
        expect(rig.stores.actionBar.snapshot()).toEqual([]);
      } finally {
        rig.dispose();
      }
    },
  );

  test("setActionButton sends an equipment set the server does not check (Player.cpp:5796-5797)", () => {
    const { rig } = setup();
    try {
      expect(
        rig.handle.act.setActionButton(12, { id: 1, type: "equipment_set" }),
      ).toEqual({ ok: true });
      expect(decodeButton(rig.sent[0]?.body ?? new Uint8Array())).toEqual({
        packed: 0x20_00_00_01,
        rest: 0,
        slot: 12,
      });
    } finally {
      rig.dispose();
    }
  });

  test("setActionBarToggles sends one u8 mask (MiscHandler.cpp:952-965)", () => {
    const { rig } = setup();
    try {
      expect(rig.handle.act.setActionBarToggles(15)).toEqual({ ok: true });
      expect(rig.sent.map((p) => [p.opcode, [...p.body]])).toEqual([
        [GameOpcode.CMSG_SET_ACTIONBAR_TOGGLES, [15]],
      ]);
    } finally {
      rig.dispose();
    }
  });

  test.each([256, -1, 1.5])(
    "setActionBarToggles refuses %p with invalid_mask and sends nothing",
    (mask) => {
      const { rig } = setup();
      try {
        expect(rig.handle.act.setActionBarToggles(mask)).toEqual({
          ok: false,
          reason: "invalid_mask",
        });
        expect(rig.sent).toEqual([]);
      } finally {
        rig.dispose();
      }
    },
  );

  test("barToggles reads byte 2 of PLAYER_FIELD_BYTES, field 1197, from self updates (MiscHandler.cpp:965, UpdateFields.h:368)", () => {
    const { rig } = setup();
    try {
      expect(rig.handle.state().barToggles).toBeUndefined();
      const update = (fields: Record<number, number>) =>
        rig.events.entity.emit({
          changed: ["rawFields"],
          entity: self(fields),
          type: "update",
        });
      update({ [FIELD_BYTES]: 0x01_0f_00_02 });
      expect(rig.handle.state().barToggles).toBe(15);
      update({});
      expect(rig.handle.state().barToggles).toBe(15);
      update({ [FIELD_BYTES]: 0 });
      expect(rig.handle.state().barToggles).toBe(0);
    } finally {
      rig.dispose();
    }
  });
});
