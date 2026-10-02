import { describe, expect, jest, test } from "bun:test";
import type { AreaState } from "@peon/core";
import type { RestAfter } from "#harness/contract/details";
import { REST_MAX_MS, restSpec } from "#harness/tools/rest";
import {
  attackBy,
  contentOf,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";
import { unitEntity } from "#test-support/world-fixtures";

const STALKER = 0x20n;
const DRINK_SPELL = 430;

function water(handle: MockHandle, count: number): void {
  const inventory = handle.getInventoryState();
  const slot = {
    bag: 255,
    guid: 0x77n,
    item: {
      contained: undefined,
      count,
      durability: undefined,
      entry: 159,
      flags: 0,
      guid: 0x77n,
      itemClass: 0,
      maxDurability: undefined,
      name: "Refreshing Spring Water",
      owner: undefined,
      quality: 1,
      randomPropertyId: 0,
      subclass: 5,
      useSpellIds: [DRINK_SPELL],
    },
    region: "backpack" as const,
    slot: 23,
    status: "occupied" as const,
  };
  handle.getInventoryState = () => ({ ...inventory, slots: [slot] });
}

function drinkAura(handle: MockHandle): void {
  const state = handle.getCombatState();
  const aura = {
    caster: 0n,
    duration: 18_000,
    flags: 0,
    level: 1,
    slot: 0,
    spellId: DRINK_SPELL,
    stacks: 1,
    timeLeft: 18_000,
  };
  const next = { ...state, auras: [aura] };
  handle.getCombatState = () => next;
  handle.triggerCombatEvent({ state: next, type: "aura" });
}

function dismountState(mounted: boolean): AreaState<"selfstate"> {
  return {
    collisionHeight: undefined,
    condition: {
      drunkState: "sober",
      drunkValue: 0,
      restedXp: 0,
      resting: false,
      restState: "unknown",
    },
    ghostPending: false,
    lastTransferAbort: undefined,
    mountDisplayId: mounted ? 1234 : 0,
    mounted,
    selfResSpell: 0,
    standState: "stand",
    timers: {},
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

function selfHp(handle: MockHandle, health: number): void {
  const state = handle.getCombatState();
  const next = { ...state, self: { ...state.self, health } };
  handle.getCombatState = () => next;
  handle.triggerEntityEvent({
    changed: ["health"],
    entity: unitEntity({
      guid: handle.getControlState().selfGuid,
      health,
      maxHealth: 200,
    }),
    type: "update",
  });
}

describe("rest", () => {
  test("drinks, confirms the aura and stops at the threshold", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 200, maxHp: 200, maxPower: 300, power: 60 });
    water(t.handle, 5);
    const used: number[] = [];
    t.handle.useItem = async (_bag, slot) => {
      used.push(slot);
      setSelf(t.handle, { hp: 200, maxHp: 200, maxPower: 300, power: 285 });
      water(t.handle, 4);
      drinkAura(t.handle);
    };
    const res = await restSpec.run({}, toolCtx<RestAfter>(t));
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(used).toEqual([23]);
    expect(text).toBe(
      "DONE rested 0 s with Refreshing Spring Water: HP 200/200, mana 285/300 (95%). 4 food and drink left.",
    );
    expect(res.after).toMatchObject({ auraConfirmed: true, idle: false });
  });

  async function ticking(
    t: Awaited<ReturnType<typeof createTestRuntime>>,
    each: (tick: number) => void,
    ticks = 200,
  ) {
    let done = false;
    const pending = restSpec.run({}, toolCtx<RestAfter>(t)).finally(() => {
      done = true;
    });
    for (let tick = 0; tick < ticks && !done; tick += 1) {
      each(tick);
      jest.advanceTimersByTime(1000);
      await flush();
    }
    return pending;
  }

  test("with no food it runs past 30 s until the threshold", async () => {
    jest.useFakeTimers();
    try {
      const t = await createTestRuntime();
      setSelf(t.handle, { hp: 100, maxHp: 200, maxPower: 300, power: 300 });
      const res = await ticking(t, (tick) => {
        if (tick % 5 === 4)
          setSelf(t.handle, {
            hp: Math.min(200, 100 + ((tick + 1) / 5) * 10),
            maxHp: 200,
            maxPower: 300,
            power: 300,
          });
      });
      expect(res.status).toBe("DONE");
      expect(res.after.durationMs).toBeGreaterThan(30_000);
      expect(res.detail).toMatch(
        /^rested \d+ s without food or drink: HP 180\/200, mana 300\/300 \(100%\)\.$/,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test("a rest that keeps rising stops at the rest limit and names it", async () => {
    jest.useFakeTimers();
    try {
      const t = await createTestRuntime();
      setSelf(t.handle, { hp: 10, maxHp: 1000, maxPower: 300, power: 300 });
      const res = await ticking(t, (tick) =>
        setSelf(t.handle, {
          hp: 10 + tick * 5,
          maxHp: 1000,
          maxPower: 300,
          power: 300,
        }),
      );
      expect(res).toMatchObject({
        after: { durationMs: REST_MAX_MS },
        next: "rest()",
        reason: "time_limit",
        status: "PARTLY",
      });
      expect(res.detail).toStartWith(
        `rested ${REST_MAX_MS / 1000} s (the limit for one rest) without food or drink: `,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test("with no food and nothing rising it stops after 10 s", async () => {
    jest.useFakeTimers();
    try {
      const t = await createTestRuntime();
      setSelf(t.handle, { hp: 100, maxHp: 200, maxPower: 300, power: 150 });
      const res = await ticking(t, () => undefined);
      expect(res).toMatchObject({
        after: { durationMs: 10_000, idle: true },
        next: "look()",
        reason: "no_regen",
        status: "PARTLY",
      });
      expect(res.detail).toBe(
        "rested 10 s without food or drink: HP 100/200, mana 150/300 (50%). Nothing rose for 10 s. Another rest() will not reach 90% without food or drink.",
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test("eats again when the food aura ends before the threshold", async () => {
    jest.useFakeTimers();
    try {
      const t = await createTestRuntime();
      setSelf(t.handle, { hp: 200, maxHp: 200, maxPower: 300, power: 30 });
      water(t.handle, 5);
      let drinks = 0;
      t.handle.useItem = async () => {
        drinks += 1;
        water(t.handle, 5 - drinks);
        drinkAura(t.handle);
      };
      const res = await ticking(t, (tick) => {
        setSelf(t.handle, {
          hp: 200,
          maxHp: 200,
          maxPower: 300,
          power: Math.min(300, 30 + tick * 6),
        });
        if (tick === 20) {
          const state = t.handle.getCombatState();
          t.handle.getCombatState = () => ({ ...state, auras: [] });
        }
      });
      expect(drinks).toBe(2);
      expect(res.status).toBe("DONE");
    } finally {
      jest.useRealTimers();
    }
  });

  test("does not use food again when its aura never came", async () => {
    jest.useFakeTimers();
    try {
      const t = await createTestRuntime();
      setSelf(t.handle, { hp: 200, maxHp: 200, maxPower: 300, power: 30 });
      water(t.handle, 5);
      let drinks = 0;
      t.handle.useItem = async () => {
        drinks += 1;
      };
      const res = await ticking(t, (tick) =>
        setSelf(t.handle, {
          hp: 200,
          maxHp: 200,
          maxPower: 300,
          power: Math.min(300, 30 + tick * 2),
        }),
      );
      expect(drinks).toBe(1);
      expect(res.after.auraConfirmed).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test.each([
    {
      detail:
        "HP 200/200, mana 240/300 (80%). Nothing rose for 10 s. Another rest() reaches 90%.",
      end: { hp: 200, maxHp: 200, maxPower: 300, power: 240 },
      name: "a full stat does not block a rising one",
      start: { hp: 200, maxHp: 200, maxPower: 300, power: 180 },
    },
    {
      detail:
        "HP 120/200, mana 300/300 (100%). Nothing rose for 10 s. Another rest() reaches about 70%.",
      end: { hp: 120, maxHp: 200, maxPower: 300, power: 300 },
      name: "a slow stat projects short of the threshold",
      start: { hp: 100, maxHp: 200, maxPower: 300, power: 300 },
    },
  ])("with no food, $name", async ({ detail, end, start }) => {
    jest.useFakeTimers();
    try {
      const t = await createTestRuntime();
      setSelf(t.handle, start);
      const res = await ticking(t, (tick) => {
        if (tick === 5) setSelf(t.handle, end);
      });
      expect(res).toMatchObject({ reason: "no_regen", status: "PARTLY" });
      expect(res.detail).toMatch(/^rested \d+ s without food or drink: /);
      expect(res.detail).toEndWith(detail);
    } finally {
      jest.useRealTimers();
    }
  });

  test.each([
    {
      hit: "none",
      hp: 200,
      name: "an attack start",
      verb: "started attacking",
    },
    { hit: "during", hp: 180, name: "a hit during the rest", verb: "hit" },
    {
      hit: "first",
      hp: 180,
      name: "a hit seen before its attack start",
      verb: "hit",
    },
    {
      hit: "before",
      hp: 200,
      name: "a hit only before the rest",
      verb: "started attacking",
    },
  ] as const)(
    "$name stops the rest with an engage step",
    async ({ hit, hp, verb }) => {
      const t = await createTestRuntime();
      setSelf(t.handle, { hp: 200, maxHp: 200, power: 60 });
      setUnits(t.handle, [
        unitRow({
          distance: 5,
          guid: STALKER,
          level: 7,
          name: "Springpaw Stalker",
          x: 5,
          y: 0,
        }),
      ]);
      if (hit === "before") {
        selfHp(t.handle, 150);
        selfHp(t.handle, 200);
      }
      const pending = restSpec.run({}, toolCtx<RestAfter>(t));
      await flush();
      if (hit === "first") selfHp(t.handle, hp);
      attackBy(t.handle, STALKER);
      if (hit === "during") selfHp(t.handle, hp);
      const res = await pending;
      expect(res).toMatchObject({ reason: "interrupted", status: "FAILED" });
      expect(res.detail).toBe(
        `Springpaw Stalker (${t.rt.refs.refOf(STALKER)}) ${verb} you while resting (HP ${hp}/200).`,
      );
      expect(res.next).toBe(`engage(target: "${t.rt.refs.refOf(STALKER)}")`);
    },
  );

  test("breath_low stops the rest with the surface line", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 100, maxHp: 200, power: 60 });
    const pending = restSpec.run({}, toolCtx<RestAfter>(t));
    await flush();
    t.handle.triggerAreaEvent("selfstate", {
      remainingMs: 7400,
      type: "breath_low",
    });
    const res = await pending;
    expect(res).toMatchObject({ reason: "interrupted", status: "FAILED" });
    expect(res.detail).toBe("Surface now: you have 8 s of breath.");
    expect(res.next).toBe("look()");
  });

  test("refuses while an attacker is on you", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 100, maxHp: 200 });
    setUnits(t.handle, [
      unitRow({
        distance: 5,
        guid: STALKER,
        level: 7,
        name: "Springpaw Stalker",
        x: 5,
        y: 0,
      }),
    ]);
    attackBy(t.handle, STALKER);
    await expect(restSpec.run({}, toolCtx<RestAfter>(t))).rejects.toMatchObject(
      { reason: "in_combat" },
    );
  });

  test("refuses when dead", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    await expect(restSpec.run({}, toolCtx<RestAfter>(t))).rejects.toMatchObject(
      { next: "recover()", reason: "dead" },
    );
  });
  test("a mounted rest dismounts first and says so", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 200, maxHp: 200, maxPower: 300, power: 60 });
    water(t.handle, 5);
    t.handle.useItem = async () => {
      setSelf(t.handle, { hp: 200, maxHp: 200, maxPower: 300, power: 285 });
      water(t.handle, 4);
      drinkAura(t.handle);
    };
    jest
      .spyOn(t.handle.selfstate, "state")
      .mockReturnValue(dismountState(true));
    const spy = jest
      .spyOn(t.handle.selfstate.act, "dismount")
      .mockResolvedValue({ status: "ok" });
    const pending = restSpec.run({}, toolCtx<RestAfter>(t));
    await flush();
    const res = await pending;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.detail.startsWith("Dismounted first. ")).toBe(true);
  });

  test("a taxi mount stops the rest with in_flight", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 100, maxHp: 200, maxPower: 300, power: 300 });
    jest
      .spyOn(t.handle.selfstate, "state")
      .mockReturnValue(dismountState(true));
    t.handle.selfstate.act.dismount = async () => ({
      reason: "in_flight",
      status: "refused",
    });
    await expect(restSpec.run({}, toolCtx<RestAfter>(t))).rejects.toMatchObject(
      { reason: "in_flight" },
    );
  });

  test("human text yields RUNNING with vitals", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 100, maxHp: 200 });
    const pending = restSpec.run({}, toolCtx<RestAfter>(t));
    t.rt.yields.trigger();
    const res = await pending;
    expect(res.status).toBe("RUNNING");
    expect(res.detail).toStartWith(
      "resting, 0 s so far. You: HP 100/200, mana 300/300 (100%), at 0, 0.",
    );
    t.rt.runs.cancel(res.runId ?? "", "tool");
  });
});
