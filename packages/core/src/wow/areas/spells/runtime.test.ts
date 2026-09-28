import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  spellsChannelStartBody,
  spellsChannelUpdateBody,
} from "#test-support/areas/spells";
import type { SpellsEvent } from "#wow/areas/spells/store";
import type { UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0x2an;
const MOB = 0xf1_30_00_3e_ea_00_0a_bcn;
const MISSILES = 5143;

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
  let now = 1000;
  const rig = areaRig("spells", { now: () => now, selfGuid: ME });
  const seen: SpellsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  rig.inject(
    GameOpcode.MSG_CHANNEL_START,
    spellsChannelStartBody({ caster: ME, duration: 3000, spellId: MISSILES }),
  );
  const selfUpdate = (fields: Record<number, number>) =>
    rig.events.entity.emit({
      changed: ["rawFields"],
      entity: self(fields),
      type: "update",
    });
  return {
    advance: (ms: number) => {
      now += ms;
    },
    rig,
    seen,
    selfUpdate,
  };
}

const CHANNEL_SPELL = UNIT_FIELDS.CHANNEL_SPELL.offset;
const CHANNEL_OBJECT = UNIT_FIELDS.CHANNEL_OBJECT.offset;

describe("spells runtime", () => {
  test("cancelChannel sends one CMSG_CANCEL_CHANNELLING and time 0 then ends it as cancelled", () => {
    const { advance, rig, seen } = setup();
    try {
      expect(rig.handle.act.cancelChannel()).toEqual({ ok: true });
      expect(rig.sent.map((p) => p.opcode)).toEqual([
        GameOpcode.CMSG_CANCEL_CHANNELLING,
      ]);
      expect(
        new PacketReader(rig.sent[0]?.body ?? new Uint8Array()).uint32LE(),
      ).toBe(MISSILES);
      advance(1000);
      rig.inject(
        GameOpcode.MSG_CHANNEL_UPDATE,
        spellsChannelUpdateBody({ caster: ME, time: 0 }),
      );
      expect(seen.at(-1)).toEqual({
        reason: "cancelled",
        spellId: MISSILES,
        type: "channel_end",
      });
    } finally {
      rig.dispose();
    }
  });

  test("cancelChannel twice sends one packet", () => {
    const { rig } = setup();
    try {
      rig.handle.act.cancelChannel();
      expect(rig.handle.act.cancelChannel()).toEqual({
        ok: false,
        reason: "cancel_requested",
      });
      expect(rig.sent).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("cancelChannel with no channel refuses and sends nothing", () => {
    const rig = areaRig("spells", { selfGuid: ME });
    try {
      expect(rig.handle.act.cancelChannel()).toEqual({
        ok: false,
        reason: "not_channelling",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("the self UNIT_FIELD_CHANNEL_OBJECT names the channel target (Spell.cpp:5380-5383)", () => {
    const { rig, selfUpdate } = setup();
    try {
      expect(rig.handle.state().channel?.target).toBeUndefined();
      selfUpdate({
        [CHANNEL_OBJECT]: Number(MOB & 0xff_ff_ff_ffn),
        [CHANNEL_OBJECT + 1]: Number(MOB >> 32n),
        [CHANNEL_SPELL]: MISSILES,
      });
      expect(rig.handle.state().channel?.target).toBe(MOB);
    } finally {
      rig.dispose();
    }
  });

  test("a stale UNIT_CHANNEL_SPELL of 0 before the field names the spell keeps the channel", () => {
    const { rig, seen, selfUpdate } = setup();
    try {
      selfUpdate({ [CHANNEL_SPELL]: 0 });
      expect(rig.handle.state().channel?.spellId).toBe(MISSILES);
      expect(seen.map((e) => e.type)).toEqual(["channel_start"]);
    } finally {
      rig.dispose();
    }
  });

  test("UNIT_CHANNEL_SPELL back to 0 with no time 0 update ends the channel (SpellHandler.cpp:565)", () => {
    const { advance, rig, seen, selfUpdate } = setup();
    try {
      selfUpdate({ [CHANNEL_SPELL]: MISSILES });
      advance(800);
      selfUpdate({ [CHANNEL_SPELL]: 0 });
      expect(seen.at(-1)).toEqual({
        reason: "interrupted",
        spellId: MISSILES,
        type: "channel_end",
      });
      expect(rig.stores.combat.casts.channel).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});
