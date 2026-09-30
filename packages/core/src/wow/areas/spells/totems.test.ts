import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { spellsTotemCreatedBody } from "#test-support/areas/spells";
import { spell } from "#test-support/spell-fixtures";
import type { SpellsEvent } from "#wow/areas/spells/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { SpellCatalog, SpellDefinition } from "#wow/spell-catalog";

const ME = 0x2an;
const STONESKIN = 8071;
const SEARING = 3599;
const EARTH_GUID = 0xf1_30_00_09_5b_00_00_01n;
const FIRE_GUID = 0xf1_30_00_09_5b_00_00_02n;
const EARTH = 1;
const FIRE = 0;

function named(id: number, name: string): SpellDefinition {
  return { ...spell(), id, name };
}

function setup() {
  let now = 1000;
  const rig = areaRig("spells", { now: () => now, selfGuid: ME });
  const defs = new Map([
    [STONESKIN, named(STONESKIN, "Stoneskin Totem")],
    [SEARING, named(SEARING, "Searing Totem")],
  ]);
  rig.stores.combat.setCatalog({
    get: (id: number) => defs.get(id),
  } as unknown as SpellCatalog);
  const seen: SpellsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  const create = (
    slot: number,
    guid: bigint,
    spellId: number,
    duration = 120_000,
  ) =>
    rig.inject(
      GameOpcode.SMSG_TOTEM_CREATED,
      spellsTotemCreatedBody({ duration, guid, slot, spell: spellId }),
    );
  const totemEvents = () =>
    seen.filter((e) => e.type === "totem_created" || e.type === "totem_gone");
  return {
    advance: (ms: number) => {
      now += ms;
      jest.advanceTimersByTime(ms);
    },
    create,
    rig,
    totemEvents,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("spells totems", () => {
  test("SMSG_TOTEM_CREATED fills the slot and emits totem_created (TotemPackets.cpp:25-33)", () => {
    const { create, rig, totemEvents } = setup();
    try {
      create(EARTH, EARTH_GUID, STONESKIN);
      expect(rig.handle.state().totems).toEqual([
        undefined,
        {
          durationMs: 120_000,
          guid: EARTH_GUID,
          slot: EARTH,
          spellId: STONESKIN,
          spellName: "Stoneskin Totem",
          startedAt: 1000,
        },
        undefined,
        undefined,
      ]);
      expect(totemEvents()).toEqual([
        {
          durationMs: 120_000,
          guid: EARTH_GUID,
          slot: EARTH,
          spellId: STONESKIN,
          spellName: "Stoneskin Totem",
          type: "totem_created",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a slot outside 0-3 is ignored", () => {
    const { create, rig, totemEvents } = setup();
    try {
      create(4, EARTH_GUID, STONESKIN);
      expect(totemEvents()).toEqual([]);
      expect(rig.handle.state().totems).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("the totem's disappear clears the slot as gone; another guid leaves it", () => {
    const { create, rig, totemEvents } = setup();
    try {
      create(EARTH, EARTH_GUID, STONESKIN);
      rig.events.entity.emit({ guid: FIRE_GUID, type: "disappear" });
      expect(rig.handle.state().totems[EARTH]).toBeDefined();
      rig.events.entity.emit({ guid: EARTH_GUID, type: "disappear" });
      expect(rig.handle.state().totems[EARTH]).toBeUndefined();
      expect(totemEvents().at(-1)).toEqual({
        guid: EARTH_GUID,
        reason: "gone",
        slot: EARTH,
        spellId: STONESKIN,
        spellName: "Stoneskin Totem",
        type: "totem_gone",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a second create for an occupied slot ends the old one as replaced, and the old guid's disappear then changes nothing (Totem.cpp:55)", () => {
    const { create, rig, totemEvents } = setup();
    try {
      create(FIRE, FIRE_GUID, SEARING);
      create(FIRE, EARTH_GUID, STONESKIN);
      expect(totemEvents().map((e) => e.type)).toEqual([
        "totem_created",
        "totem_gone",
        "totem_created",
      ]);
      expect(totemEvents()[1]).toMatchObject({
        guid: FIRE_GUID,
        reason: "replaced",
        slot: FIRE,
      });
      rig.events.entity.emit({ guid: FIRE_GUID, type: "disappear" });
      expect(totemEvents()).toHaveLength(3);
      expect(rig.handle.state().totems[FIRE]?.guid).toBe(EARTH_GUID);
    } finally {
      rig.dispose();
    }
  });

  test("a totem expires at startedAt + durationMs with reason expired", () => {
    const { advance, create, rig, totemEvents } = setup();
    try {
      create(FIRE, FIRE_GUID, SEARING, 5000);
      advance(4999);
      expect(rig.handle.state().totems[FIRE]).toBeDefined();
      advance(1);
      expect(rig.handle.state().totems[FIRE]).toBeUndefined();
      expect(totemEvents().at(-1)).toMatchObject({
        reason: "expired",
        slot: FIRE,
        type: "totem_gone",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a duration beyond the timer range does not expire the totem at once", () => {
    const { advance, create, rig, totemEvents } = setup();
    try {
      create(FIRE, FIRE_GUID, SEARING, 0xff_ff_ff_ff);
      advance(1000);
      expect(rig.handle.state().totems[FIRE]?.guid).toBe(FIRE_GUID);
      expect(totemEvents().filter((e) => e.type === "totem_gone")).toHaveLength(
        0,
      );
    } finally {
      rig.dispose();
    }
  });

  test("a replaced totem's timer does not end its successor", () => {
    const { advance, create, rig, totemEvents } = setup();
    try {
      create(FIRE, FIRE_GUID, SEARING, 5000);
      advance(1000);
      create(FIRE, EARTH_GUID, STONESKIN, 60_000);
      advance(4000);
      expect(rig.handle.state().totems[FIRE]?.guid).toBe(EARTH_GUID);
      expect(totemEvents().filter((e) => e.type === "totem_gone")).toHaveLength(
        1,
      );
    } finally {
      rig.dispose();
    }
  });

  test("a disappear cancels the timer so no second gone follows", () => {
    const { advance, create, rig, totemEvents } = setup();
    try {
      create(FIRE, FIRE_GUID, SEARING, 5000);
      rig.events.entity.emit({ guid: FIRE_GUID, type: "disappear" });
      advance(10_000);
      expect(totemEvents().filter((e) => e.type === "totem_gone")).toHaveLength(
        1,
      );
    } finally {
      rig.dispose();
    }
  });

  test("dispose releases every totem timer", () => {
    const { create, rig, totemEvents } = setup();
    create(FIRE, FIRE_GUID, SEARING, 5000);
    create(EARTH, EARTH_GUID, STONESKIN, 6000);
    expect(jest.getTimerCount()).toBe(2);
    rig.dispose();
    expect(jest.getTimerCount()).toBe(0);
    expect(totemEvents()).toHaveLength(2);
  });
});

describe("spells destroyTotem", () => {
  test("sends CMSG_TOTEM_DESTROYED with the wire slot and ends the slot as destroyed when the totem disappears (SpellHandler.cpp:686-705)", () => {
    const { create, rig, totemEvents } = setup();
    try {
      create(EARTH, EARTH_GUID, STONESKIN);
      expect(rig.handle.act.destroyTotem(EARTH)).toEqual({ ok: true });
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.CMSG_TOTEM_DESTROYED);
      expect(Array.from(rig.sent[0]?.body ?? [])).toEqual([EARTH]);
      expect(rig.handle.state().totems[EARTH]).toBeDefined();
      rig.events.entity.emit({ guid: EARTH_GUID, type: "disappear" });
      expect(totemEvents().at(-1)).toMatchObject({
        reason: "destroyed",
        slot: EARTH,
        type: "totem_gone",
      });
    } finally {
      rig.dispose();
    }
  });

  test("an empty slot returns no_totem and sends nothing", () => {
    const { rig } = setup();
    try {
      expect(rig.handle.act.destroyTotem(0)).toEqual({
        ok: false,
        reason: "no_totem",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a slot outside 0-3 or not a whole number returns invalid_slot", () => {
    const { create, rig } = setup();
    try {
      create(EARTH, EARTH_GUID, STONESKIN);
      for (const slot of [4, -1, 1.5, Number.NaN]) {
        expect(rig.handle.act.destroyTotem(slot)).toEqual({
          ok: false,
          reason: "invalid_slot",
        });
      }
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
