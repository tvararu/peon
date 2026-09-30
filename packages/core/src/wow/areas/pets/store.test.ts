import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  petsPetActionFeedbackBody,
  petsPetActionSoundBody,
  petsPetDismissSoundBody,
  petsPetLearnedSpellBody,
  petsPetSpellsBody,
  petsPetUnlearnedSpellBody,
} from "#test-support/areas/pets";
import { testStores } from "#test-support/session-fixtures";
import { type PetsEvent, PetsStore } from "#wow/areas/pets/store";
import type { Entity } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { SessionDeps } from "#wow/session-stores";

const ME = 0x2an;
const PET = 0xf1_40_00_0c_9f_00_01_e6n;
const BITE = 17_253;
const GROWL = 2649;
const DASH = 23_099;
const CLAW = 16_827;

const BAR = petsPetSpellsBody({
  command: 1,
  cooldowns: [
    { category: 0, categoryCooldown: 0, cooldown: 4500, spell: BITE },
    { category: 0, categoryCooldown: 0x80_00_00_00, cooldown: 1, spell: GROWL },
    { category: 0, categoryCooldown: 0, cooldown: 0, spell: DASH },
  ],
  duration: 0,
  family: 1,
  flags: 0,
  guid: PET,
  react: 1,
  slots: [
    { action: 2, type: 0x07 },
    { action: 1, type: 0x07 },
    { action: 0, type: 0x07 },
    { action: BITE, type: 0xc1 },
    { action: GROWL, type: 0x81 },
    { action: DASH, type: 0x01 },
    { action: 0, type: 0x01 },
    { action: 2, type: 0x06 },
    { action: 1, type: 0x06 },
    { action: 0, type: 0x06 },
  ],
  spells: [
    { action: BITE, type: 0xc1 },
    { action: GROWL, type: 0x81 },
    { action: DASH, type: 0x01 },
  ],
});

function rig(start = 1000) {
  let t = start;
  const r = areaRig("pets", { now: () => t, selfGuid: ME });
  const seen: PetsEvent[] = [];
  r.handle.onEvent((event) => seen.push(event));
  return {
    advance: (ms: number) => {
      t += ms;
    },
    r,
    seen,
  };
}

describe("PetsStore", () => {
  test("starts with no bar, no cooldowns, no refusal and no pet", () => {
    const { r } = rig();
    try {
      expect(r.handle.state()).toEqual({
        bar: undefined,
        cooldowns: [],
        lastRefusal: undefined,
        names: {},
        pet: undefined,
        stable: undefined,
      });
    } finally {
      r.dispose();
    }
  });

  test("a pet bar sets the stance, command, slots and spells with one bar event", () => {
    const { r, seen } = rig();
    try {
      r.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
      const { bar } = r.handle.state();
      expect(bar).toMatchObject({
        command: "follow",
        durationMs: 0,
        family: 1,
        flags: 0,
        guid: PET,
        react: "defensive",
        receivedAt: 1000,
        spells: [
          { autocast: "on", spell: BITE },
          { autocast: "off", spell: GROWL },
          { autocast: "passive", spell: DASH },
        ],
      });
      expect(bar?.slots[3]).toEqual({ action: BITE, type: 0xc1 });
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({
        bar: { guid: PET, react: "defensive" },
        cleared: false,
        type: "bar",
      });
    } finally {
      r.dispose();
    }
  });

  test("cooldowns are absolute end times, an infinite one has none, and an expired one drops", () => {
    const { r, advance } = rig();
    try {
      r.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
      expect(r.handle.state().cooldowns).toEqual([
        { category: 0, infinite: false, readyAt: 5500, spell: BITE },
        { category: 0, infinite: true, readyAt: undefined, spell: GROWL },
      ]);
      advance(4500);
      expect(r.handle.state().cooldowns).toEqual([
        { category: 0, infinite: true, readyAt: undefined, spell: GROWL },
      ]);
    } finally {
      r.dispose();
    }
  });

  test("the clear form removes the bar and its cooldowns with a cleared bar event", () => {
    const { r, seen } = rig();
    try {
      r.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
      r.inject(GameOpcode.SMSG_PET_SPELLS, petsPetSpellsBody({ guid: 0n }));
      expect(r.handle.state().bar).toBeUndefined();
      expect(r.handle.state().cooldowns).toEqual([]);
      expect(seen.at(-1)).toEqual({ cleared: true, type: "bar" });
    } finally {
      r.dispose();
    }
  });

  test("a learned spell joins the bar with autocast off and an unlearned one leaves it", () => {
    const { r, seen } = rig();
    try {
      r.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
      r.inject(
        GameOpcode.SMSG_PET_LEARNED_SPELL,
        petsPetLearnedSpellBody({ spell: CLAW }),
      );
      expect(r.handle.state().bar?.spells.at(-1)).toEqual({
        autocast: "off",
        spell: CLAW,
      });
      expect(seen.at(-1)).toEqual({ spell: CLAW, type: "spell_learned" });
      r.inject(
        GameOpcode.SMSG_PET_LEARNED_SPELL,
        petsPetLearnedSpellBody({ spell: CLAW }),
      );
      expect(
        r.handle.state().bar?.spells.filter((row) => row.spell === CLAW),
      ).toHaveLength(1);
      r.inject(
        GameOpcode.SMSG_PET_UNLEARNED_SPELL,
        petsPetUnlearnedSpellBody({ spell: BITE }),
      );
      expect(r.handle.state().bar?.spells.map((row) => row.spell)).toEqual([
        GROWL,
        DASH,
        CLAW,
      ]);
      expect(seen.at(-1)).toEqual({ spell: BITE, type: "spell_unlearned" });
    } finally {
      r.dispose();
    }
  });

  test("a learned or unlearned spell with no bar still emits its event", () => {
    const { r, seen } = rig();
    try {
      r.inject(
        GameOpcode.SMSG_PET_LEARNED_SPELL,
        petsPetLearnedSpellBody({ spell: CLAW }),
      );
      r.inject(
        GameOpcode.SMSG_PET_UNLEARNED_SPELL,
        petsPetUnlearnedSpellBody({ spell: CLAW }),
      );
      expect(r.handle.state().bar).toBeUndefined();
      expect(seen).toEqual([
        { spell: CLAW, type: "spell_learned" },
        { spell: CLAW, type: "spell_unlearned" },
      ]);
    } finally {
      r.dispose();
    }
  });

  test("the snapshot carries the pet view of the owner's summon", () => {
    const owner = {
      guid: ME,
      rawFields: new Map([
        [UNIT_FIELDS.SUMMON.offset, 0x9f_00_01_e6],
        [UNIT_FIELDS.SUMMON.offset + 1, 0xf1_40_00_0c],
      ]),
    } as unknown as Entity;
    const pet = {
      guid: PET,
      rawFields: new Map([[UNIT_FIELDS.PETNUMBER.offset, 7]]),
    } as unknown as Entity;
    const deps: SessionDeps = {
      getEntity: (guid) => [owner, pet].find((entity) => entity.guid === guid),
      now: () => 0,
      selfGuid: () => ME,
      send: () => undefined,
      updateEntity: () => undefined,
    };
    const store = new PetsStore(deps, testStores(deps));
    expect(store.snapshot().pet).toMatchObject({ guid: PET, number: 7 });
  });

  test("action feedback sets the last refusal and emits a feedback event (Unit.cpp:12556-12564)", () => {
    const { r, seen, advance } = rig();
    try {
      advance(250);
      r.inject(
        GameOpcode.SMSG_PET_ACTION_FEEDBACK,
        petsPetActionFeedbackBody({ code: 1 }),
      );
      expect(r.handle.state().lastRefusal).toEqual({
        at: 1250,
        reason: "pet_dead",
      });
      expect(seen).toEqual([{ reason: "pet_dead", type: "feedback" }]);
      r.inject(
        GameOpcode.SMSG_PET_ACTION_FEEDBACK,
        petsPetActionFeedbackBody({ code: 3 }),
      );
      expect(r.handle.state().lastRefusal?.reason).toBe("cant_attack");
    } finally {
      r.dispose();
    }
  });

  test("the action and dismiss sounds change no state and emit nothing", () => {
    const { r, seen } = rig();
    try {
      r.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
      const before = r.handle.state();
      r.inject(
        GameOpcode.SMSG_PET_ACTION_SOUND,
        petsPetActionSoundBody({ action: 1, guid: PET }),
      );
      r.inject(
        GameOpcode.SMSG_PET_DISMISS_SOUND,
        petsPetDismissSoundBody({ modelId: 4449, x: 1, y: 2, z: 3 }),
      );
      expect(r.handle.state()).toEqual(before);
      expect(seen.map((event) => event.type)).toEqual(["bar"]);
    } finally {
      r.dispose();
    }
  });
  test("a pet cast failure sets the last refusal and emits cast_failed (Spell.cpp:4842-4861)", () => {
    const { r, seen, advance } = rig();
    try {
      r.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
      advance(250);
      const w = new PacketWriter();
      w.uint8(3);
      w.uint32LE(GROWL);
      w.uint8(67);
      r.inject(GameOpcode.SMSG_PET_CAST_FAILED, w.finish());
      expect(r.handle.state().lastRefusal).toEqual({
        at: 1250,
        reason: "not_ready",
      });
      expect(seen.at(-1)).toEqual({
        castCount: 3,
        reason: "not_ready",
        spell: GROWL,
        type: "cast_failed",
      });
    } finally {
      r.dispose();
    }
  });

  test("a pet-guid SMSG_SPELL_COOLDOWN sets a pet cooldown and the character's guid changes nothing (Unit.cpp:16620-16627)", () => {
    const { r } = rig();
    try {
      r.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
      const pet = new PacketWriter();
      pet.uint64LE(PET);
      pet.uint8(0);
      pet.uint32LE(CLAW);
      pet.uint32LE(2000);
      r.inject(GameOpcode.SMSG_SPELL_COOLDOWN, pet.finish());
      expect(
        r.handle.state().cooldowns.find((row) => row.spell === CLAW),
      ).toEqual({ category: 0, infinite: false, readyAt: 3000, spell: CLAW });
      const other = new PacketWriter();
      other.uint64LE(ME);
      other.uint8(0);
      other.uint32LE(DASH);
      other.uint32LE(9000);
      r.inject(GameOpcode.SMSG_SPELL_COOLDOWN, other.finish());
      expect(
        r.handle.state().cooldowns.find((row) => row.spell === DASH),
      ).toBeUndefined();
    } finally {
      r.dispose();
    }
  });

  test("a cooldown update keeps the known category and a new spell starts at 0", () => {
    const { r } = rig();
    try {
      r.inject(
        GameOpcode.SMSG_PET_SPELLS,
        petsPetSpellsBody({
          command: 1,
          cooldowns: [
            { category: 7, categoryCooldown: 0, cooldown: 4500, spell: BITE },
          ],
          duration: 0,
          family: 1,
          flags: 0,
          guid: PET,
          react: 1,
          slots: [
            { action: 0, type: 0x01 },
            { action: 0, type: 0x01 },
            { action: 0, type: 0x01 },
            { action: 0, type: 0x01 },
            { action: 0, type: 0x01 },
            { action: 0, type: 0x01 },
            { action: 0, type: 0x01 },
            { action: 0, type: 0x01 },
            { action: 0, type: 0x01 },
            { action: 0, type: 0x01 },
          ],
          spells: [{ action: BITE, type: 0xc1 }],
        }),
      );
      const update = new PacketWriter();
      update.uint64LE(PET);
      update.uint8(0);
      update.uint32LE(BITE);
      update.uint32LE(2000);
      r.inject(GameOpcode.SMSG_SPELL_COOLDOWN, update.finish());
      expect(
        r.handle.state().cooldowns.find((row) => row.spell === BITE),
      ).toEqual({
        category: 7,
        infinite: false,
        readyAt: 3000,
        spell: BITE,
      });
      const fresh = new PacketWriter();
      fresh.uint64LE(PET);
      fresh.uint8(0);
      fresh.uint32LE(CLAW);
      fresh.uint32LE(2000);
      r.inject(GameOpcode.SMSG_SPELL_COOLDOWN, fresh.finish());
      expect(
        r.handle.state().cooldowns.find((row) => row.spell === CLAW),
      ).toEqual({ category: 0, infinite: false, readyAt: 3000, spell: CLAW });
    } finally {
      r.dispose();
    }
  });

  test("SMSG_CLEAR_COOLDOWN clears only the pet's row for its own guid (Pet.cpp:2458)", () => {
    const { r } = rig();
    try {
      r.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
      const clear = new PacketWriter();
      clear.uint32LE(BITE);
      clear.uint64LE(PET);
      r.inject(GameOpcode.SMSG_CLEAR_COOLDOWN, clear.finish());
      expect(r.handle.state().cooldowns.some((row) => row.spell === BITE)).toBe(
        false,
      );
      expect(
        r.handle.state().cooldowns.some((row) => row.spell === GROWL),
      ).toBe(true);
      const foreign = new PacketWriter();
      foreign.uint32LE(GROWL);
      foreign.uint64LE(ME);
      r.inject(GameOpcode.SMSG_CLEAR_COOLDOWN, foreign.finish());
      expect(
        r.handle.state().cooldowns.some((row) => row.spell === GROWL),
      ).toBe(true);
    } finally {
      r.dispose();
    }
  });
});
