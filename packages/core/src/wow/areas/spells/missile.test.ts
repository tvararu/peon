import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  spellsProjectilePositionBody,
  spellsSpellStartBody,
} from "#test-support/areas/spells";
import type { SpellsEvent } from "#wow/areas/spells/store";
import { registerCombatHandlers } from "#wow/gameplay-handlers";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import type { WorldConn } from "#wow/world-conn";

const ME = 0x2an;
const MOB = 0xf1_30_00_79_d8_00_00_11n;
const FLAMESTRIKE = 2120;
const OTHER_SPELL = 133;

function setup() {
  const rig = areaRig("spells", {
    now: () => 1000,
    register: (dispatch, stores) =>
      registerCombatHandlers(
        { dispatch } as unknown as WorldConn,
        stores as Pick<typeof stores, "combat" | "motion" | "self">,
      ),
    selfGuid: ME,
  });
  const seen: SpellsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  rig.stores.combat.applyInitialSpells({
    cooldowns: [],
    spells: [{ spellId: FLAMESTRIKE }],
  });
  const startCast = (spellId = FLAMESTRIKE) => {
    rig.stores.combat.casts.send(() => undefined, spellId, MOB);
    const count = rig.stores.combat.casts.pending?.count ?? 0;
    rig.inject(
      GameOpcode.SMSG_SPELL_START,
      spellsSpellStartBody({
        castCount: count,
        caster: ME,
        flags: 0,
        spellId,
        target: MOB,
        timer: 2000,
      }),
    );
    return count;
  };
  return { rig, seen, startCast };
}

describe("missile acts", () => {
  test("reportProjectile refuses a spell the character is not casting and sends nothing", () => {
    const { rig, startCast } = setup();
    try {
      expect(rig.handle.act.reportProjectile(FLAMESTRIKE, 1, 2, 3)).toEqual({
        ok: false,
        reason: "not_casting",
      });
      startCast();
      expect(rig.handle.act.reportProjectile(OTHER_SPELL, 1, 2, 3)).toEqual({
        ok: false,
        reason: "not_casting",
      });
      expect(
        rig.sent.filter(
          (p) => p.opcode === GameOpcode.CMSG_UPDATE_PROJECTILE_POSITION,
        ),
      ).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("reportProjectile sends the self guid, spell, the live cast count and the position", () => {
    const { rig, startCast } = setup();
    try {
      const count = startCast();
      expect(count).toBeGreaterThan(0);
      expect(rig.handle.act.reportProjectile(FLAMESTRIKE, 1.5, -2, 3)).toEqual({
        ok: true,
      });
      const sent = rig.sent.filter(
        (p) => p.opcode === GameOpcode.CMSG_UPDATE_PROJECTILE_POSITION,
      );
      expect(sent).toHaveLength(1);
      const r = new PacketReader(sent[0]?.body ?? new Uint8Array());
      expect(r.uint64LE()).toBe(ME);
      expect(r.uint32LE()).toBe(FLAMESTRIKE);
      expect(r.uint8()).toBe(count);
      expect([r.floatLE(), r.floatLE(), r.floatLE()]).toEqual([1.5, -2, 3]);
    } finally {
      rig.dispose();
    }
  });

  test("reportMissileTrajectory refuses an uncast spell and otherwise sends the trajectory with moveStop 0", () => {
    const { rig, startCast } = setup();
    const trajectory = {
      current: { x: 1, y: 2, z: 3 },
      elevation: 0.25,
      speed: 18,
      target: { x: 4, y: 5, z: 6 },
    };
    try {
      expect(
        rig.handle.act.reportMissileTrajectory(FLAMESTRIKE, trajectory),
      ).toEqual({ ok: false, reason: "not_casting" });
      expect(rig.sent).toEqual([]);
      startCast();
      expect(
        rig.handle.act.reportMissileTrajectory(FLAMESTRIKE, trajectory),
      ).toEqual({ ok: true });
      const sent = rig.sent.filter(
        (p) => p.opcode === GameOpcode.CMSG_UPDATE_MISSILE_TRAJECTORY,
      );
      expect(sent).toHaveLength(1);
      const body = sent[0]?.body ?? new Uint8Array();
      expect(body.length).toBe(45);
      expect(body.at(-1)).toBe(0);
    } finally {
      rig.dispose();
    }
  });
});

describe("SMSG_SET_PROJECTILE_POSITION", () => {
  test("emits projectile_moved for any caster, not only the character (SpellHandler.cpp:871)", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_SET_PROJECTILE_POSITION,
        spellsProjectilePositionBody({
          castCount: 4,
          caster: MOB,
          x: 10,
          y: 20,
          z: 30,
        }),
      );
      expect(seen).toEqual([
        {
          castCount: 4,
          caster: MOB,
          type: "projectile_moved",
          x: 10,
          y: 20,
          z: 30,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });
});
