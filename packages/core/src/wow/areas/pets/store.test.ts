import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  petsPetLearnedSpellBody,
  petsPetSpellsBody,
  petsPetUnlearnedSpellBody,
} from "#test-support/areas/pets";
import { testStores } from "#test-support/session-fixtures";
import { type PetsEvent, PetsStore } from "#wow/areas/pets/store";
import type { Entity } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";
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
        pet: undefined,
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
});
