import { describe, expect, jest, test } from "bun:test";
import type { ControlPose, EntityLookup, UnitEntity } from "@peon/core";
import { createWorldEvents } from "@peon/core/test-support/internals";
import { createRuns } from "#harness/loops/runs";
import { fakeRecovery } from "#test-support/cycle-recovery-fixtures";
import {
  advanceUntilSettled,
  body,
  fakeControl,
  fakeLoot,
  lootableCorpse,
} from "#test-support/encounter-cycle-fixtures";

type Fakes = {
  loot?: ReturnType<typeof fakeLoot>;
  recovery?: ReturnType<typeof fakeRecovery>;
  control?: ReturnType<typeof fakeControl>;
  cycleActive?: () => boolean;
  entity?: EntityLookup;
};

const idle = new AbortController().signal;

function wire(fakes: Fakes) {
  const loot = fakes.loot ?? fakeLoot({});
  const recovery = fakes.recovery ?? fakeRecovery({ life: ["alive"] });
  const control = fakes.control ?? fakeControl();
  const cycleActive = fakes.cycleActive ?? (() => false);
  const events = createWorldEvents();
  loot.onEvent((event) => events.rewards.emit(event));
  recovery.onEvent((event) => events.recovery.emit(event));
  control.onEvent((event) => events.control.emit(event));
  const bags = {
    questItems: () => new Set<number>(),
    stackSize: async () => undefined,
  };
  const entity = fakes.entity ?? (() => undefined);
  const deps = {
    bags,
    control,
    cycleActive,
    entity,
    events: {
      control: events.control.subscribe.bind(events.control),
      entity: events.entity.subscribe.bind(events.entity),
      recovery: events.recovery.subscribe.bind(events.recovery),
      rewards: events.rewards.subscribe.bind(events.rewards),
    },
    recovery,
    rewards: loot,
  };
  return { events, runs: createRuns(deps) };
}

describe("lootCorpse", () => {
  test("takes every slot and the money and returns the record", async () => {
    const loot = fakeLoot({
      items: [4, 7],
      money: 9,
      coinageBefore: 10,
      coinageAfter: 19,
    });
    const { runs } = wire({ loot });
    expect(await runs.lootCorpse(2n, idle)).toEqual({
      ok: true,
      record: {
        guid: "2",
        slotsTaken: [4, 7],
        slotsLeft: [],
        moneyTaken: 9,
        coinageBefore: 10,
        coinageAfter: 19,
      },
    });
  });

  test("returns no record for a corpse with nothing to loot", async () => {
    const loot = fakeLoot({ corpse: { dead: true, lootable: false } });
    const { runs } = wire({ loot });
    expect(await runs.lootCorpse(2n, idle)).toEqual({
      ok: true,
      record: undefined,
    });
  });

  test("a finished run frees the next one", async () => {
    const loot = fakeLoot({ corpse: { dead: true, lootable: false } });
    const { runs } = wire({ loot });
    await runs.lootCorpse(2n, idle);
    expect(await runs.lootCorpse(2n, idle)).toMatchObject({ ok: true });
  });

  test("waits for the death update of its own target only", async () => {
    const loot = fakeLoot({
      items: [4],
      corpse: { dead: false, lootable: true },
    });
    const { events, runs } = wire({ loot });
    const looted = runs.lootCorpse(2n, idle);
    await loot.attempted;
    events.entity.emit(body(9n, 0));
    await Bun.sleep(1);
    loot.corpse.dead = true;
    events.entity.emit(body(2n, 0));
    expect(await looted).toMatchObject({
      ok: true,
      record: { slotsTaken: [4] },
    });
  });

  test("unsubscribes from the world events when it returns", async () => {
    const { events, runs } = wire({ loot: fakeLoot({ items: [4] }) });
    await runs.lootCorpse(2n, idle);
    expect(events.rewards.size).toBe(0);
    expect(events.entity.size).toBe(0);
  });

  test("refuses while the encounter cycle runs", async () => {
    const loot = fakeLoot({ items: [4] });
    const { runs } = wire({ loot, cycleActive: () => true });
    expect(await runs.lootCorpse(2n, idle)).toMatchObject({
      ok: false,
      cause: "busy",
    });
    expect(loot.taken()).toEqual([]);
  });

  test("refuses a second run while one is open", async () => {
    const loot = fakeLoot({ items: [], deferClose: true });
    const { runs } = wire({ loot });
    const first = runs.lootCorpse(2n, idle);
    await loot.closing;
    expect(await runs.lootCorpse(3n, idle)).toMatchObject({
      ok: false,
      cause: "busy",
    });
    loot.acknowledgeClose();
    expect(await first).toMatchObject({ ok: true });
  });

  test("returns cancelled for an aborted signal", async () => {
    const { runs } = wire({ loot: fakeLoot({ items: [4] }) });
    const controller = new AbortController();
    controller.abort();
    expect(await runs.lootCorpse(2n, controller.signal)).toMatchObject({
      ok: false,
      cause: "cancelled",
    });
  });

  test("returns cancelled when the signal aborts during the run", async () => {
    const loot = fakeLoot({ items: [4] });
    const { runs } = wire({ loot });
    const controller = new AbortController();
    const looted = runs.lootCorpse(2n, controller.signal);
    controller.abort();
    expect(await looted).toMatchObject({ ok: false, cause: "cancelled" });
    expect(loot.taken()).toEqual([]);
  });
});

const origin: ControlPose = {
  mapId: 0,
  x: 0,
  y: 0,
  z: 0,
  orientation: 0,
  source: "predicted",
  updatedAt: 0,
};

function corpseAt(x: number) {
  return {
    status: "found" as const,
    mapId: 0,
    corpseMapId: 0,
    position: { x, y: 0, z: 0 },
  };
}

describe("recoverCorpse", () => {
  test("releases, finds a corpse in range and reclaims it", async () => {
    const control = fakeControl({ pose: origin });
    const recovery = fakeRecovery({
      life: ["dead", "ghost", "alive"],
      corpse: corpseAt(5),
      pose: () => control.pose(),
    });
    const { runs } = wire({ control, recovery });
    expect(await runs.recoverCorpse(idle)).toMatchObject({
      ok: true,
      outcome: "reclaimed",
      detail: { range: 5, legs: 0 },
    });
    expect(control.moves()).toEqual([]);
  });

  test("walks legs on control stop events to a far corpse", async () => {
    jest.useFakeTimers();
    try {
      const control = fakeControl({ pose: origin });
      const recovery = fakeRecovery({
        life: ["ghost", "alive"],
        corpse: corpseAt(70),
        pose: () => control.pose(),
      });
      const { runs } = wire({ control, recovery });
      const recovered = runs.recoverCorpse(idle);
      await advanceUntilSettled(recovered, 10_000);
      expect(await recovered).toMatchObject({
        ok: true,
        outcome: "reclaimed",
        detail: { legs: 2 },
      });
      expect(control.moves()).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test("accepts a pending resurrection", async () => {
    const recovery = fakeRecovery({ offer: true, life: ["dead", "alive"] });
    const { runs } = wire({ recovery });
    expect(await runs.recoverCorpse(idle)).toMatchObject({
      ok: true,
      outcome: "resurrected",
    });
    expect(recovery.answered()).toBe(true);
  });

  test("stops with life_unknown for a live character", async () => {
    const { runs } = wire({ recovery: fakeRecovery({ life: ["alive"] }) });
    expect(await runs.recoverCorpse(idle)).toMatchObject({
      ok: false,
      cause: "life_unknown",
    });
  });

  test("refuses while the encounter cycle runs", async () => {
    const recovery = fakeRecovery({ offer: true, life: ["dead", "alive"] });
    const { runs } = wire({ recovery, cycleActive: () => true });
    expect(await runs.recoverCorpse(idle)).toMatchObject({
      ok: false,
      cause: "busy",
    });
    expect(recovery.answered()).toBe(false);
  });

  test("shares one guard with lootCorpse", async () => {
    const loot = fakeLoot({ items: [], deferClose: true });
    const recovery = fakeRecovery({ offer: true, life: ["dead", "alive"] });
    const { runs } = wire({ loot, recovery });
    const looted = runs.lootCorpse(2n, idle);
    await loot.closing;
    expect(await runs.recoverCorpse(idle)).toMatchObject({
      ok: false,
      cause: "busy",
    });
    loot.acknowledgeClose();
    await looted;
    expect(recovery.answered()).toBe(false);
  });

  test("returns cancelled when the signal aborts during the run", async () => {
    const control = fakeControl({ pose: origin });
    const recovery = fakeRecovery({
      life: ["ghost", "alive"],
      corpse: corpseAt(70),
      pose: () => control.pose(),
    });
    const { runs } = wire({ control, recovery });
    const controller = new AbortController();
    const recovered = runs.recoverCorpse(controller.signal);
    controller.abort();
    expect(await recovered).toMatchObject({ ok: false, cause: "cancelled" });
    expect(control.moves()).toEqual([]);
  });

  test("unsubscribes from the world events when it returns", async () => {
    const recovery = fakeRecovery({ offer: true, life: ["dead", "alive"] });
    const { events, runs } = wire({ recovery });
    await runs.recoverCorpse(idle);
    expect(events.recovery.size).toBe(0);
    expect(events.control.size).toBe(0);
  });
});

test("a standalone loot walks to a corpse out of reach before the open", async () => {
  jest.useFakeTimers();
  try {
    const control = fakeControl({
      pose: {
        mapId: 0,
        orientation: 0,
        source: "predicted",
        updatedAt: 0,
        x: 0,
        y: 0,
        z: 0,
      },
    });
    const { entity: live } = body(2n, 0, { x: 0, y: 9, z: 0 }) as {
      entity: UnitEntity;
    };
    const entity = lootableCorpse(live);
    const loot = fakeLoot({ items: [4] });
    const { runs } = wire({ control, entity: () => entity, loot });
    const running = runs.lootCorpse(2n, idle);
    await advanceUntilSettled(running, 10_000);
    expect(control.moves().length).toBeGreaterThan(0);
    expect(await running).toMatchObject({ ok: true });
    expect(loot.taken()).toEqual([4]);
  } finally {
    jest.useRealTimers();
  }
});
