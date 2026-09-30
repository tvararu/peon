import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  petsStabledPetsBody,
  petsStableResultBody,
} from "#test-support/areas/pets";
import type { PetsEvent } from "#wow/areas/pets/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const NPC = 0xf1_30_00_41_11_00_00_01n;

function rig() {
  const r = areaRig("pets", { now: () => 1000, selfGuid: 0x2an });
  const seen: PetsEvent[] = [];
  r.handle.onEvent((event) => seen.push(event));
  return { r, seen };
}

const LIST = petsStabledPetsBody({
  npc: NPC,
  pets: [
    { entry: 17_525, flag: 1, level: 10, name: "Ravager", number: 5 },
    { entry: 17_525, flag: 2, level: 10, name: "Ravager", number: 9 },
  ],
  slots: 2,
});

describe("pets stable store", () => {
  test("a list reply fills the stable and emits stable_list", () => {
    const { r, seen } = rig();
    try {
      r.inject(GameOpcode.MSG_LIST_STABLED_PETS, LIST);
      const stable = r.handle.state().stable;
      expect(stable?.npc).toBe(NPC);
      expect(stable?.slots).toBe(2);
      expect(stable?.stale).toBe(false);
      expect(stable?.pets.map((pet) => [pet.number, pet.state])).toEqual([
        [5, "active"],
        [9, "stabled"],
      ]);
      expect(seen.map((event) => event.type)).toEqual(["stable_list"]);
    } finally {
      r.dispose();
    }
  });

  test("an empty list with zero slots is kept as a known empty stable", () => {
    const { r } = rig();
    try {
      r.inject(
        GameOpcode.MSG_LIST_STABLED_PETS,
        petsStabledPetsBody({ npc: NPC, pets: [], slots: 0 }),
      );
      expect(r.handle.state().stable).toEqual({
        npc: NPC,
        pets: [],
        slots: 0,
        stale: false,
      });
    } finally {
      r.dispose();
    }
  });

  test("a result emits stable_result with its name", () => {
    const { r, seen } = rig();
    try {
      r.inject(GameOpcode.SMSG_STABLE_RESULT, petsStableResultBody(0x0a));
      expect(seen).toEqual([
        { code: 0x0a, result: "slot_bought", type: "stable_result" },
      ]);
    } finally {
      r.dispose();
    }
  });

  test("a refusing result sets lastRefusal and a success does not", () => {
    const { r } = rig();
    try {
      r.inject(GameOpcode.SMSG_STABLE_RESULT, petsStableResultBody(0x08));
      expect(r.handle.state().lastRefusal).toBeUndefined();
      for (const [code, reason] of [
        [0x01, "money"],
        [0x06, "refused"],
        [0x0c, "exotic"],
      ] as const) {
        r.inject(GameOpcode.SMSG_STABLE_RESULT, petsStableResultBody(code));
        expect(r.handle.state().lastRefusal).toEqual({ at: 1000, reason });
      }
    } finally {
      r.dispose();
    }
  });

  test("a successful result marks the known list stale and keeps its rows", () => {
    const { r } = rig();
    try {
      r.inject(GameOpcode.MSG_LIST_STABLED_PETS, LIST);
      r.inject(GameOpcode.SMSG_STABLE_RESULT, petsStableResultBody(0x09));
      const stable = r.handle.state().stable;
      expect(stable?.stale).toBe(true);
      expect(stable?.pets).toHaveLength(2);
      r.inject(GameOpcode.MSG_LIST_STABLED_PETS, LIST);
      expect(r.handle.state().stable?.stale).toBe(false);
    } finally {
      r.dispose();
    }
  });

  test("a refusing result leaves the known list fresh", () => {
    const { r } = rig();
    try {
      r.inject(GameOpcode.MSG_LIST_STABLED_PETS, LIST);
      r.inject(GameOpcode.SMSG_STABLE_RESULT, petsStableResultBody(0x06));
      expect(r.handle.state().stable?.stale).toBe(false);
    } finally {
      r.dispose();
    }
  });

  test("the stable slice clears when the store is disposed", () => {
    const { r } = rig();
    r.inject(GameOpcode.MSG_LIST_STABLED_PETS, LIST);
    r.dispose();
    expect(r.handle.state().stable).toBeUndefined();
  });

  test("a stable list does not disturb the pet bar", () => {
    const { r } = rig();
    try {
      r.inject(GameOpcode.MSG_LIST_STABLED_PETS, LIST);
      expect(r.handle.state().bar).toBeUndefined();
      expect(r.handle.state().names).toEqual({});
    } finally {
      r.dispose();
    }
  });

  test("a snapshot copies the rows so later lists cannot move it", () => {
    const { r } = rig();
    try {
      r.inject(GameOpcode.MSG_LIST_STABLED_PETS, LIST);
      const before = r.handle.state().stable?.pets;
      r.inject(
        GameOpcode.MSG_LIST_STABLED_PETS,
        petsStabledPetsBody({ npc: NPC, pets: [], slots: 1 }),
      );
      expect(before).toHaveLength(2);
      expect(r.handle.state().stable?.pets).toHaveLength(0);
    } finally {
      r.dispose();
    }
  });

  test("a duplicate pet label stays as two rows", () => {
    const { r } = rig();
    try {
      r.inject(GameOpcode.MSG_LIST_STABLED_PETS, LIST);
      expect(r.handle.state().stable?.pets.map((pet) => pet.name)).toEqual([
        "Ravager",
        "Ravager",
      ]);
    } finally {
      r.dispose();
    }
  });

  test("every stable event routes through the consumer switch", () => {
    const { r, seen } = rig();
    const kinds: string[] = [];
    try {
      for (const event of seen) {
        switch (event.type) {
          case "stable_list":
            kinds.push(event.stable.npc === NPC ? "list" : "other-npc");
            break;
          case "stable_result":
            kinds.push(event.result);
            break;
          case "unanswered":
            kinds.push(event.request);
            break;
          case "bar":
          case "spell_learned":
          case "spell_unlearned":
          case "feedback":
          case "cast_failed":
          case "name":
          case "name_invalid":
            kinds.push(event.type);
            break;
          default:
            break;
        }
      }
      r.inject(GameOpcode.MSG_LIST_STABLED_PETS, LIST);
      r.inject(GameOpcode.SMSG_STABLE_RESULT, petsStableResultBody(0x08));
      expect(kinds).toEqual([]);
      expect(seen.map((event) => event.type)).toEqual([
        "stable_list",
        "stable_result",
      ]);
    } finally {
      r.dispose();
    }
  });
});
