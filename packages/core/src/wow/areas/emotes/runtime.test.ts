import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import type { Entity, EntityEvent, UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0xde1n;
const CREATURE = 0xf1_30_00_3d_28_01_48_d2n;
const CHEST = 0xf1_10_00_00_01_00_00_09n;
const DANCE_STATE = 10;
const EMOTE_STATE = UNIT_FIELDS.NPC_EMOTESTATE.offset;

function unit(
  guid: bigint,
  fields: [number, number][],
  objectType: 3 | 4 = ObjectType.UNIT,
): UnitEntity {
  return {
    class_: 1,
    displayId: 1,
    entry: 15_656,
    factionTemplate: 14,
    gender: 0,
    guid,
    health: 100,
    level: 10,
    maxHealth: 100,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "Angershade",
    npcFlags: 0,
    objectType,
    position: undefined,
    power: [0, 0, 0, 0, 0, 0, 0],
    race: 0,
    rawFields: new Map(fields),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function chest(fields: [number, number][]): Entity {
  return {
    entry: 1,
    guid: CHEST,
    name: "Chest",
    objectType: ObjectType.GAMEOBJECT,
    position: undefined,
    rawFields: new Map(fields),
    scale: 1,
  };
}

function rig() {
  const r = areaRig("emotes", { selfGuid: ME });
  const states = () => r.handle.state().emoteStates;
  return { r, states };
}

describe("emotes runtime", () => {
  test("appear and update read NPC_EMOTESTATE into the emote states", () => {
    const { r, states } = rig();
    try {
      r.events.entity.emit({
        entity: unit(CREATURE, [[EMOTE_STATE, DANCE_STATE]]),
        type: "appear",
      });
      r.events.entity.emit({
        changed: ["rawFields"],
        entity: unit(ME, [[EMOTE_STATE, DANCE_STATE]], ObjectType.PLAYER),
        type: "update",
      });
      expect(states()).toEqual([
        { guid: CREATURE, state: DANCE_STATE },
        { guid: ME, state: DANCE_STATE },
      ]);
      r.events.entity.emit({
        changed: ["rawFields"],
        entity: unit(ME, [[EMOTE_STATE, 0]], ObjectType.PLAYER),
        type: "update",
      });
      r.events.entity.emit({
        changed: ["health"],
        entity: unit(CREATURE, []),
        type: "update",
      });
      expect(states()).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("disappear forgets the unit", () => {
    const { r, states } = rig();
    try {
      r.events.entity.emit({
        entity: unit(CREATURE, [[EMOTE_STATE, DANCE_STATE]]),
        type: "appear",
      });
      r.events.entity.emit({ guid: CREATURE, type: "disappear" });
      expect(states()).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("a game object's field at the same offset is not an emote state", () => {
    const { r, states } = rig();
    try {
      r.events.entity.emit({
        entity: chest([[EMOTE_STATE, DANCE_STATE]]),
        type: "appear",
      });
      expect(states()).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("an entity event without an entity changes nothing", () => {
    const { r, states } = rig();
    try {
      r.events.entity.emit({ type: "appear" } as EntityEvent);
      expect(states()).toEqual([]);
    } finally {
      r.dispose();
    }
  });
});

const GHOST_FLAG = 0x10;
const SPAM_MS = 1000;

function self(health: number, flags = 0): Entity {
  return {
    entry: 0,
    guid: ME,
    name: "Me",
    objectType: ObjectType.PLAYER,
    position: undefined,
    rawFields: new Map([
      [UNIT_FIELDS.HEALTH.offset, health],
      [PLAYER_FIELDS.FLAGS.offset, flags],
    ]),
    scale: 1,
  };
}

function actRig(entity: () => Entity = () => self(100)) {
  return areaRig("emotes", {
    getEntity: (guid) => (guid === ME ? entity() : undefined),
    now: () => performance.now(),
    selfGuid: ME,
  });
}

const words = (body: Uint8Array) => [
  ...new Uint32Array(body.slice(0, body.length & ~3).buffer),
];

describe("emote acts", () => {
  test("emote(3) sends CMSG_EMOTE and other ids are refused", () => {
    const r = actRig();
    try {
      expect(r.handle.act.emote(3)).toEqual({ ok: true });
      expect(r.handle.act.emote(0)).toEqual({ ok: true });
      expect(r.handle.act.emote(5)).toEqual({ ok: false, reason: "only_wave" });
      expect(r.sent.map((p) => [p.opcode, words(p.body)])).toEqual([
        [GameOpcode.CMSG_EMOTE, [3]],
        [GameOpcode.CMSG_EMOTE, [0]],
      ]);
    } finally {
      r.dispose();
    }
  });

  test("textEmote resolves a name and sends the target", async () => {
    const r = actRig();
    try {
      expect(await r.handle.act.textEmote("Dance", CREATURE)).toEqual({
        ok: true,
      });
      expect(r.sent).toHaveLength(1);
      expect(r.sent[0]?.opcode).toBe(GameOpcode.CMSG_TEXT_EMOTE);
      const body = r.sent[0]?.body ?? new Uint8Array();
      expect(words(body.slice(0, 8))).toEqual([34, 0xff_ff_ff_ff]);
      expect(
        new DataView(body.buffer, body.byteOffset).getBigUint64(8, true),
      ).toBe(CREATURE);
    } finally {
      r.dispose();
    }
  });

  test("a numeric id must be a known text emote", async () => {
    const r = actRig();
    try {
      expect(await r.handle.act.textEmote(101)).toEqual({ ok: true });
      const refused = await r.handle.act.textEmote(9999);
      expect(refused.ok).toBe(false);
      expect(r.sent).toHaveLength(1);
    } finally {
      r.dispose();
    }
  });

  test("an unknown name lists the five closest and sends nothing", async () => {
    const r = actRig();
    try {
      const outcome = await r.handle.act.textEmote("dnace");
      expect(outcome).toMatchObject({ ok: false, reason: "unknown_emote" });
      if (outcome.ok || outcome.reason !== "unknown_emote")
        throw new Error("expected unknown_emote");
      expect(outcome.closest).toHaveLength(5);
      expect(outcome.closest[0]).toBe("dance");
      expect(r.sent).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("ready and 126 are refused as a ready check", async () => {
    const r = actRig();
    try {
      expect(await r.handle.act.textEmote("ready")).toEqual({
        ok: false,
        reason: "ready_check",
      });
      expect(await r.handle.act.textEmote(126)).toEqual({
        ok: false,
        reason: "ready_check",
      });
      expect(r.sent).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("a second text emote waits out the spam guard, a third waits for the second", async () => {
    await withFakeTimers(async () => {
      const r = actRig();
      try {
        const first = r.handle.act.textEmote("wave");
        const second = r.handle.act.textEmote("dance");
        const third = r.handle.act.textEmote("salute");
        await elapse(10);
        expect(r.sent).toHaveLength(1);
        await elapse(SPAM_MS - 20);
        expect(r.sent).toHaveLength(1);
        await elapse(20);
        expect(r.sent).toHaveLength(2);
        await elapse(SPAM_MS);
        expect(r.sent).toHaveLength(3);
        expect(await Promise.all([first, second, third])).toEqual([
          { ok: true },
          { ok: true },
          { ok: true },
        ]);
        expect(r.sent.map((p) => words(p.body)[0])).toEqual([101, 34, 78]);
      } finally {
        r.dispose();
      }
    });
  });

  test("a text emote after the guard has passed sends at once", async () => {
    await withFakeTimers(async () => {
      const r = actRig();
      try {
        await r.handle.act.textEmote("wave");
        await elapse(SPAM_MS);
        await r.handle.act.textEmote("dance");
        expect(r.sent).toHaveLength(2);
      } finally {
        r.dispose();
      }
    });
  });

  test("dead and ghost characters get dead from both acts", async () => {
    for (const entity of [self(0), self(1, GHOST_FLAG), undefined]) {
      const r = actRig(() => entity as Entity);
      try {
        expect(r.handle.act.emote(3)).toEqual({ ok: false, reason: "dead" });
        expect(await r.handle.act.textEmote("wave")).toEqual({
          ok: false,
          reason: "dead",
        });
        expect(r.sent).toEqual([]);
      } finally {
        r.dispose();
      }
    }
  });

  test("death during the spam wait cancels the queued emote", async () => {
    await withFakeTimers(async () => {
      let health = 100;
      const r = actRig(() => self(health));
      try {
        await r.handle.act.textEmote("wave");
        const queued = r.handle.act.textEmote("dance");
        await elapse(100);
        health = 0;
        await elapse(SPAM_MS);
        expect(await queued).toEqual({ ok: false, reason: "dead" });
        expect(r.sent).toHaveLength(1);
      } finally {
        r.dispose();
      }
    });
  });

  test("dispose while a text emote waits resolves it without sending", async () => {
    await withFakeTimers(async () => {
      const r = actRig();
      await r.handle.act.textEmote("wave");
      const queued = r.handle.act.textEmote("dance");
      await elapse(100);
      r.dispose();
      expect(await queued).toEqual({ ok: false, reason: "cancelled" });
      expect(r.sent).toHaveLength(1);
    });
  });

  test("dispose cancels every queued text emote without starting a new wait", async () => {
    await withFakeTimers(async () => {
      const r = actRig();
      await r.handle.act.textEmote("wave");
      const second = r.handle.act.textEmote("dance");
      const third = r.handle.act.textEmote("cheer");
      await elapse(100);
      r.dispose();
      expect(await Promise.all([second, third])).toEqual([
        { ok: false, reason: "cancelled" },
        { ok: false, reason: "cancelled" },
      ]);
      expect(jest.getTimerCount()).toBe(0);
      expect(r.sent).toHaveLength(1);
    });
  });
});

describe("emote spam guard under timer lateness", () => {
  async function settle(): Promise<void> {
    await elapse(0);
    await elapse(0);
  }

  test("a late timer pushes the next send a full gap after the actual send", async () => {
    await withFakeTimers(async () => {
      const r = actRig();
      try {
        const first = r.handle.act.textEmote("wave");
        const second = r.handle.act.textEmote("dance");
        const third = r.handle.act.textEmote("salute");
        await elapse(10);
        expect(r.sent).toHaveLength(1);
        jest.advanceTimersByTime(SPAM_MS + 500);
        await settle();
        expect(r.sent).toHaveLength(2);
        jest.advanceTimersByTime(SPAM_MS - 20);
        await settle();
        expect(r.sent).toHaveLength(2);
        jest.advanceTimersByTime(20);
        await settle();
        expect(r.sent).toHaveLength(3);
        expect(await Promise.all([first, second, third])).toEqual([
          { ok: true },
          { ok: true },
          { ok: true },
        ]);
      } finally {
        r.dispose();
      }
    });
  });

  test("dispose after the timer fired but before the send cancels it", async () => {
    await withFakeTimers(async () => {
      const r = actRig();
      await r.handle.act.textEmote("wave");
      const queued = r.handle.act.textEmote("dance");
      await elapse(10);
      jest.advanceTimersByTime(SPAM_MS);
      r.dispose();
      expect(await queued).toEqual({ ok: false, reason: "cancelled" });
      expect(r.sent).toHaveLength(1);
    });
  });
});
