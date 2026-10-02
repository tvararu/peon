import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";

const ME = 0x2an;
const CREATURE = 0xf1_30_00_3d_28_01_48_d2n;
const KNOWN_BASE = PLAYER_FIELDS.KNOWN_TITLES.offset;
const CHOSEN = PLAYER_FIELDS.CHOSEN_TITLE.offset;

function self(words: [number, number][], chosen: number): Entity {
  return {
    entry: 0,
    guid: ME,
    name: "Me",
    objectType: ObjectType.PLAYER,
    position: undefined,
    rawFields: new Map([...words, [CHOSEN, chosen]]),
    scale: 1,
  };
}

const bodyWords = (body: Uint8Array) => [
  ...new Uint32Array(body.slice(0, body.length & ~3).buffer),
];

function wordOf(bit: number): [number, number] {
  return [KNOWN_BASE + (bit >> 5), 1 << (bit % 32)];
}

describe("achievements runtime", () => {
  test("a self update refreshes the known bits and the chosen title", () => {
    const r = areaRig("achievements", { selfGuid: ME });
    try {
      r.events.entity.emit({
        entity: self([wordOf(110)], 110),
        type: "appear",
      });
      expect(r.handle.state().titles).toEqual({
        chosen: 110,
        known: [110],
      });
      r.events.entity.emit({
        changed: ["rawFields"],
        entity: self([wordOf(40), wordOf(110)], 40),
        type: "update",
      });
      expect(r.handle.state().titles).toEqual({
        chosen: 40,
        known: [40, 110],
      });
    } finally {
      r.dispose();
    }
  });

  test("another unit's fields change nothing", () => {
    const r = areaRig("achievements", { selfGuid: ME });
    try {
      r.events.entity.emit({
        entity: {
          entry: 0,
          guid: CREATURE,
          name: "Creature",
          objectType: ObjectType.UNIT,
          position: undefined,
          rawFields: new Map([wordOf(110), [CHOSEN, 110]]),
          scale: 1,
        },
        type: "appear",
      });
      expect(r.handle.state().titles).toEqual({ chosen: 0, known: [] });
    } finally {
      r.dispose();
    }
  });

  test("setTitle sends the known bit and clear writes -1", () => {
    const r = areaRig("achievements", { selfGuid: ME });
    try {
      r.events.entity.emit({
        entity: self([wordOf(110)], 0),
        type: "appear",
      });
      expect(r.handle.act.setTitle(110)).toEqual({ bit: 110, ok: true });
      expect(r.handle.act.setTitle(undefined)).toEqual({
        bit: undefined,
        ok: true,
      });
      expect(r.sent.map((p) => [p.opcode, bodyWords(p.body)])).toEqual([
        [GameOpcode.CMSG_SET_TITLE, [110]],
        [GameOpcode.CMSG_SET_TITLE, [0xff_ff_ff_ff]],
      ]);
    } finally {
      r.dispose();
    }
  });

  test("setTitle refuses an unknown or out-of-range bit and sends nothing", () => {
    const r = areaRig("achievements", { selfGuid: ME });
    try {
      expect(r.handle.act.setTitle(110)).toEqual({
        ok: false,
        reason: "unknown_title",
      });
      expect(r.handle.act.setTitle(0)).toEqual({
        ok: false,
        reason: "bad_title",
      });
      expect(r.handle.act.setTitle(192)).toEqual({
        ok: false,
        reason: "bad_title",
      });
      expect(r.sent).toEqual([]);
    } finally {
      r.dispose();
    }
  });
});
