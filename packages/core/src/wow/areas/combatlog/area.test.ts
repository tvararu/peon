import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  combatlogAttackerStateBody,
  combatlogComboPointsBody,
  combatlogPartyKillBody,
  combatlogPowerUpdateBody,
  combatlogSpellDamageBody,
} from "#test-support/areas/combatlog";
import type { CombatlogEvent } from "#wow/areas/combatlog/store";
import { areaStubs } from "#wow/areas/compose";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const BOAR = 0xf1_30_00_3e_ea_00_0a_bcn;

function rigWithEvents() {
  const rig = areaRig("combatlog", { now: () => 50, selfGuid: ME });
  const seen: CombatlogEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("combatlog area wiring", () => {
  test("SMSG_ATTACKERSTATEUPDATE adds one melee entry and emits one entry event", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_ATTACKERSTATEUPDATE,
        combatlogAttackerStateBody({
          attacker: BOAR,
          hitInfo: 0x2,
          parts: [{ amount: 9, schoolMask: 1 }],
          target: ME,
        }),
      );
      expect(rig.handle.state().entries).toEqual([
        {
          amount: 9,
          at: 50,
          kind: "melee",
          schoolMask: 1,
          source: BOAR,
          target: ME,
        },
      ]);
      expect(seen.map((event) => event.type)).toEqual(["entry"]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SPELLNONMELEEDAMAGELOG adds one spell_damage entry", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLNONMELEEDAMAGELOG,
        combatlogSpellDamageBody({
          amount: 31,
          attacker: ME,
          schoolMask: 4,
          spellId: 133,
          target: BOAR,
        }),
      );
      expect(rig.handle.state().entries).toEqual([
        {
          amount: 31,
          at: 50,
          kind: "spell_damage",
          schoolMask: 4,
          source: ME,
          spellId: 133,
          target: BOAR,
        },
      ]);
      expect(seen).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("the entry events reach the world event bus", () => {
    const { rig } = rigWithEvents();
    const areas: string[] = [];
    rig.events.area.subscribe(({ area, event }) =>
      areas.push(`${area}/${event.type}`),
    );
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLNONMELEEDAMAGELOG,
        combatlogSpellDamageBody({
          amount: 1,
          attacker: ME,
          schoolMask: 4,
          spellId: 133,
          target: BOAR,
        }),
      );
      expect(areas).toEqual(["combatlog/entry"]);
    } finally {
      rig.dispose();
    }
  });

  test("the two damage logs are no longer stubs", () => {
    const stubbed = areaStubs().map(([opcode]) => opcode);
    expect(stubbed).not.toContain(GameOpcode.SMSG_ATTACKERSTATEUPDATE);
    expect(stubbed).not.toContain(GameOpcode.SMSG_SPELLNONMELEEDAMAGELOG);
  });
});

describe("combatlog kills (Unit.cpp:13583-13585)", () => {
  test("a kill by the character emits kill and adds one kill entry", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_PARTYKILLLOG,
        combatlogPartyKillBody({ killer: ME, victim: BOAR }),
      );
      expect(seen).toEqual([
        {
          at: 50,
          bySelf: 1,
          killer: ME,
          killerKind: "self",
          ourTarget: 0,
          type: "kill",
          victim: BOAR,
        },
      ]);
      const state = rig.handle.state();
      expect(state.kills).toEqual([
        {
          at: 50,
          bySelf: true,
          killer: ME,
          killerKind: "self",
          ourTarget: false,
          victim: BOAR,
        },
      ]);
      expect(state.entries).toEqual([
        { amount: 0, at: 50, kind: "kill", source: ME, target: BOAR },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a kill by an unknown unit is bySelf 0 with killerKind unknown", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_PARTYKILLLOG,
        combatlogPartyKillBody({ killer: 0x2bn, victim: BOAR }),
      );
      expect(seen).toMatchObject([
        { bySelf: 0, killer: 0x2bn, killerKind: "unknown", type: "kill" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("the kill list keeps the last 20", () => {
    const { rig } = rigWithEvents();
    try {
      for (let i = 1n; i <= 21n; i++)
        rig.inject(
          GameOpcode.SMSG_PARTYKILLLOG,
          combatlogPartyKillBody({ killer: ME, victim: BOAR + i }),
        );
      const { kills } = rig.handle.state();
      expect(kills).toHaveLength(20);
      expect(kills[0]?.victim).toBe(BOAR + 2n);
      expect(kills.at(-1)?.victim).toBe(BOAR + 21n);
    } finally {
      rig.dispose();
    }
  });
});

describe("combatlog combo points (Unit.cpp:12851-12857)", () => {
  test("points on a target emit combo_points and set the state", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_COMBO_POINTS,
        combatlogComboPointsBody({ points: 3, target: BOAR }),
      );
      expect(seen).toEqual([{ points: 3, target: BOAR, type: "combo_points" }]);
      expect(rig.handle.state().comboPoints).toEqual({
        points: 3,
        target: BOAR,
      });
    } finally {
      rig.dispose();
    }
  });

  test("0 points with no target clears the state", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_COMBO_POINTS,
        combatlogComboPointsBody({ points: 2, target: BOAR }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_COMBO_POINTS,
        combatlogComboPointsBody({ points: 0 }),
      );
      expect(seen.at(-1)).toEqual({ points: 0, type: "combo_points" });
      expect(rig.handle.state().comboPoints).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("both opcodes are handled and neither is a stub", () => {
    const { rig } = rigWithEvents();
    try {
      expect(rig.dispatch.has(GameOpcode.SMSG_PARTYKILLLOG)).toBe(true);
      expect(rig.dispatch.has(GameOpcode.SMSG_UPDATE_COMBO_POINTS)).toBe(true);
      const stubbed = areaStubs().map(([opcode]) => opcode);
      expect(stubbed).not.toContain(GameOpcode.SMSG_PARTYKILLLOG);
      expect(stubbed).not.toContain(GameOpcode.SMSG_UPDATE_COMBO_POINTS);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_POWER_UPDATE is handled, is no stub, and adds no entry", () => {
    const { rig, seen } = rigWithEvents();
    try {
      expect(rig.dispatch.has(GameOpcode.SMSG_POWER_UPDATE)).toBe(true);
      expect(areaStubs().map(([opcode]) => opcode)).not.toContain(
        GameOpcode.SMSG_POWER_UPDATE,
      );
      rig.inject(
        GameOpcode.SMSG_POWER_UPDATE,
        combatlogPowerUpdateBody({ guid: BOAR, power: 0, value: 12 }),
      );
      expect(rig.handle.state().entries).toEqual([]);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
