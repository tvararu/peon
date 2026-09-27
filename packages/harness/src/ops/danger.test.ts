import { describe, expect, test } from "bun:test";
import type { Sighting, Sightings } from "#harness/contract/services";
import {
  createAttackLedger,
  dangerLine,
  dangerView,
} from "#harness/ops/danger";
import { createRefTable } from "#harness/ops/refs";
import { createTestRuntime } from "#test-support/runtime-fixture";
import {
  nearbyRow,
  SELF_GUID,
  selfCombat,
  setWorld,
  unitEntity,
} from "#test-support/world-fixtures";

type Handle = Awaited<ReturnType<typeof world>>["handle"];

function selfHealth(handle: Handle, health: number): void {
  handle.triggerEntityEvent({
    changed: ["health"],
    entity: unitEntity({ guid: SELF_GUID, health, maxHealth: 217 }),
    type: "update",
  });
}

function stalkerAt(handle: Handle, dx: number, health = 217): void {
  const stalker = unitEntity({ dx, guid: 0x50n, name: "Springpaw Stalker" });
  setWorld(handle, {
    combat: { attackers: [0x50n], self: selfCombat({ health }) },
    rows: [nearbyRow(stalker)],
  });
}

async function world(now: { t: number }) {
  const clock = { now: () => now.t };
  const attacks = createAttackLedger(clock);
  const { handle, rt } = await createTestRuntime({
    parts: { attacks, clock, refs: createRefTable() },
  });
  attacks.attach(handle);
  return { attacks, handle, rt };
}

describe("createAttackLedger", () => {
  test("an attack start names the attacker but is not a hit", async () => {
    const now = { t: 1000 };
    const { attacks, handle } = await world(now);
    handle.triggerCombatEvent({
      attacker: 0x50n,
      state: handle.getCombatState(),
      type: "attacked",
    });
    expect(attacks.lastHitAt(0x50n)).toBeUndefined();
    expect(attacks.lastAttacker()).toBe(0x50n);
  });

  test("an HP drop is a hit by every current attacker", async () => {
    const now = { t: 1000 };
    const { attacks, handle } = await world(now);
    stalkerAt(handle, 3);
    selfHealth(handle, 217);
    now.t = 2000;
    selfHealth(handle, 200);
    expect(attacks.lastHitAt(0x50n)).toBe(2000);
    now.t = 3000;
    selfHealth(handle, 210);
    expect(attacks.lastHitAt(0x50n)).toBe(2000);
  });

  test("ignores HP changes of other units", async () => {
    const { attacks, handle } = await world({ t: 0 });
    stalkerAt(handle, 3);
    for (const health of [100, 50])
      handle.triggerEntityEvent({
        changed: ["health"],
        entity: unitEntity({ guid: 0x77n, health }),
        type: "update",
      });
    expect(attacks.lastHitAt(0x50n)).toBeUndefined();
  });

  test("ignores attacked events without an attacker (before C5)", async () => {
    const { attacks, handle } = await world({ t: 0 });
    handle.triggerCombatEvent({
      state: handle.getCombatState(),
      type: "attacked",
    });
    expect(attacks.lastAttacker()).toBeUndefined();
  });

  test("a new attach resets the ledger", async () => {
    const { attacks, handle } = await world({ t: 0 });
    stalkerAt(handle, 3);
    selfHealth(handle, 217);
    selfHealth(handle, 200);
    attacks.attach(handle);
    expect(attacks.lastHitAt(0x50n)).toBeUndefined();
  });
});

describe("dangerView and dangerLine", () => {
  test("the design example", async () => {
    const now = { t: 1000 };
    const { handle, rt } = await world(now);
    stalkerAt(handle, 0, 89);
    selfHealth(handle, 120);
    selfHealth(handle, 89);
    now.t = 4000;
    const view = dangerView({ handle, rt });
    expect(view).toEqual({
      attackers: [
        {
          distance: 0,
          guid: "50",
          hitAgoMs: 3000,
          name: "Springpaw Stalker",
          ref: "u1",
        },
      ],
      hpPct: 41,
    });
    expect(dangerLine(view)).toBe(
      "Danger: Springpaw Stalker u1 is attacking you (hit you 3 s ago). You are at 41% HP.",
    );
  });

  test("an attack start with no hit yet says the attacker is coming", async () => {
    const now = { t: 1000 };
    const { handle, rt } = await world(now);
    stalkerAt(handle, 12);
    handle.triggerCombatEvent({
      attacker: 0x50n,
      state: handle.getCombatState(),
      type: "attacked",
    });
    now.t = 5000;
    expect(dangerLine(dangerView({ handle, rt }))).toBe(
      "Danger: Springpaw Stalker u1 is coming at you (12 yd). You are at 100% HP.",
    );
  });

  test("the hit age counts from the latest HP drop", async () => {
    const now = { t: 0 };
    const { handle, rt } = await world(now);
    stalkerAt(handle, 2, 90);
    handle.triggerCombatEvent({
      attacker: 0x50n,
      state: handle.getCombatState(),
      type: "attacked",
    });
    selfHealth(handle, 186);
    for (const [at, health] of [
      [2000, 170],
      [20_000, 130],
      [34_000, 90],
    ] as const) {
      now.t = at;
      selfHealth(handle, health);
    }
    now.t = 36_000;
    expect(dangerLine(dangerView({ handle, rt }))).toBe(
      "Danger: Springpaw Stalker u1 is attacking you (hit you 2 s ago). You are at 41% HP.",
    );
  });

  test("drops the brackets when no hit and no distance are known", () => {
    const view = {
      attackers: [
        {
          distance: undefined,
          guid: "50",
          hitAgoMs: undefined,
          name: "Springpaw Stalker",
          ref: "u9",
        },
      ],
      hpPct: 88,
    };
    expect(dangerLine(view)).toBe(
      "Danger: Springpaw Stalker u9 is coming at you. You are at 88% HP.",
    );
  });

  test("counts the other attackers", () => {
    const attacker = (ref: string) => ({
      distance: 3,
      guid: ref,
      hitAgoMs: 1000,
      name: "Mana Wyrm",
      ref,
    });
    expect(
      dangerLine({
        attackers: [attacker("u3"), attacker("u4"), attacker("u5")],
        hpPct: 30,
      }),
    ).toBe(
      "Danger: Mana Wyrm u3 and 2 more are attacking you. You are at 30% HP.",
    );
  });

  test("gives no line without attackers", () => {
    expect(dangerLine({ attackers: [], hpPct: 100 })).toBeUndefined();
  });

  test("says still for a stop", () => {
    const one = {
      attackers: [
        {
          distance: 12,
          guid: "50",
          hitAgoMs: undefined,
          name: "Springpaw Stalker",
          ref: "u9",
        },
      ],
      hpPct: 88,
    };
    expect(dangerLine(one, { still: true })).toBe(
      "Danger: Springpaw Stalker u9 is still coming at you (12 yd). You are at 88% HP.",
    );
    const attacker = (ref: string) => ({
      distance: 3,
      guid: ref,
      hitAgoMs: 1000,
      name: "Mana Wyrm",
      ref,
    });
    expect(
      dangerLine(
        { attackers: [attacker("u3"), attacker("u4")], hpPct: 30 },
        { still: true },
      ),
    ).toBe(
      "Danger: Mana Wyrm u3 and 1 more are still attacking you. You are at 30% HP.",
    );
  });

  test("names an attacker from sightings, else as an unknown unit", async () => {
    const wyrm: Sighting = {
      alive: true,
      entry: 15_274,
      guid: 0x60n,
      kind: "creature",
      level: 5,
      lootable: false,
      mapId: 530,
      name: "Mana Wyrm",
      relation: "hostile",
      roles: [],
      seenAt: 0,
      x: 0,
      y: 0,
      z: 0,
    };
    const sightings: Sightings = {
      all: () => [wyrm],
      attach: () => () => {},
      forget: () => {},
      get: (guid) => (guid === 0x60n ? wyrm : undefined),
      note: () => {},
      prune: () => {},
    };
    const { handle, rt } = await createTestRuntime({
      parts: { refs: createRefTable(), sightings },
    });
    setWorld(handle, { combat: { attackers: [0x60n, 0x61n] } });
    expect(dangerView({ handle, rt }).attackers.map((a) => a.name)).toEqual([
      "Mana Wyrm",
      "an unknown unit",
    ]);
  });
});
