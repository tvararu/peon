import { describe, expect, test } from "bun:test";
import { fakeRecovery } from "#test-support/cycle-recovery-fixtures";
import {
  body,
  fakeControl,
  fakeLoot,
} from "#test-support/encounter-cycle-fixtures";
import { createRuns } from "#wow/client-runs";
import { createWorldEvents } from "#wow/world-events";

type Fakes = {
  loot?: ReturnType<typeof fakeLoot>;
  recovery?: ReturnType<typeof fakeRecovery>;
  control?: ReturnType<typeof fakeControl>;
  cycleActive?: () => boolean;
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
  const deps = { bags, control, cycleActive, events, recovery, rewards: loot };
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
