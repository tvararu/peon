import { describe, expect, test } from "bun:test";
import type { QuestQuery } from "@peon/core";
import type { EngageAfter } from "#harness/contract/details";
import type { CycleState, CycleTargetRecord } from "#harness/loops/cycle-types";
import type { TacticsOutcome } from "#harness/loops/tactics";
import { engageSpec } from "#harness/tools/engage";
import {
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

type KnownQuest = Extract<QuestQuery, { status: "known" }>["data"];

const STALKER = 0x20n;
const STALKER_2 = 0x22n;
const TENDER = 0x23n;
const KILL: TacticsOutcome = {
  reason: "server_kill_credit",
  status: "completed",
};

function mob(guid: bigint, name: string, distance: number) {
  return unitRow({
    distance,
    entry: 15_366,
    guid,
    level: 7,
    name,
    x: distance,
    y: 0,
  });
}

async function field() {
  const t = await createTestRuntime();
  t.handle.capabilities = () => ({
    factions: true,
    jev: true,
    navigation: true,
    spells: true,
  });
  setSelf(t.handle, { level: 10 });
  setUnits(t.handle, [
    mob(STALKER, "Springpaw Stalker", 22),
    mob(STALKER_2, "Springpaw Stalker", 28),
    mob(TENDER, "Eversong Tender", 30),
  ]);
  return t;
}

function done(guid: bigint): CycleTargetRecord {
  return { guid, loot: "looted", outcome: KILL, status: "done" };
}

function cycleKills(
  handle: MockHandle,
  records: CycleTargetRecord[],
  stopCause: string,
  onKill: (index: number) => void = () => undefined,
): void {
  const base = handle.getCycleState();
  const start = async () => {
    let state: CycleState = { ...base, active: true, phase: "fighting" };
    handle.getCycleState = () => state;
    queueMicrotask(() => {
      for (let index = 0; index < records.length; index += 1) {
        onKill(index);
        state = { ...state, queue: records.slice(0, index + 1) };
        handle.triggerCycleEvent({ at: 0, state, type: "target_done" });
      }
      state = { ...state, active: false, phase: "stopped", stopCause };
      handle.triggerCycleEvent({ at: 0, state, type: "stopped" });
    });
  };
  handle.startCycle = start;
  handle.startQuestCycle = start;
}

function questLog(handle: MockHandle, required: number, current: number) {
  const target = {
    count: required,
    encodedNpcOrGoId: 15_274,
    itemDropId: 0,
    npcOrGoId: 15_274,
    unknownSourceCount: 0,
  };
  const none = { ...target, count: 0, encodedNpcOrGoId: 0, npcOrGoId: 0 };
  const data = {
    objectives: "",
    questId: 8325,
    requiredItems: [],
    targets: [target, none, none, none],
    title: "Reclaiming Sunstrider Isle",
  } as unknown as KnownQuest;
  const state = handle.getQuestState();
  const next = {
    ...state,
    log: {
      complete: true,
      slots: [
        {
          counters: [current, 0, 0, 0] as [number, number, number, number],
          expiresAtSeconds: 0,
          flags: 0,
          questId: 8325,
          slot: 0,
        },
      ],
    },
    queries: [{ data, questId: 8325, receivedAt: 0, status: "known" as const }],
  };
  handle.getQuestState = () => next;
}

describe("engage progress", () => {
  test("a cycle counts each kill credit as it lands", async () => {
    const t = await field();
    cycleKills(t.handle, [done(STALKER), done(STALKER_2)], "queue_exhausted");
    const ctx = toolCtx<EngageAfter>(t);
    await engageSpec.run({ count: 2, target: "Springpaw Stalker" }, ctx);
    const details = ctx.updates.map((update) => update.detail);
    expect(details).toContain("engage 1 of 2 kills.");
    expect(details.at(-1)).toBe("engage 2 of 2 kills.");
  });

  test("a quest run counts from the quest log, not from 0 of 0", async () => {
    const t = await field();
    questLog(t.handle, 8, 0);
    cycleKills(t.handle, [done(STALKER)], "max_starts_reached", () =>
      questLog(t.handle, 8, 1),
    );
    const ctx = toolCtx<EngageAfter>(t);
    const res = await engageSpec.run({ quest: "8325" }, ctx);
    const details = ctx.updates.map((update) => update.detail);
    expect(details).not.toContain("engage 0 of 0 kills.");
    expect(details.at(-1)).toBe("engage 1 of 8 kills.");
    expect(res.detail).toContain(`1 of 8 kills (${t.rt.refs.refOf(STALKER)})`);
    expect(res.detail).toContain("7 kills still needed");
    expect(res.next).toBe('engage(quest: "8325")');
  });
});

describe("engage kill names", () => {
  test("kills of different creatures are named per creature", async () => {
    const t = await field();
    cycleKills(
      t.handle,
      [done(STALKER), done(STALKER_2), done(TENDER)],
      "queue_exhausted",
    );
    const res = await engageSpec.run(
      { count: 3, target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    const [a, b, c] = [STALKER, STALKER_2, TENDER].map((guid) =>
      t.rt.refs.refOf(guid),
    );
    expect(res.detail).toStartWith(
      `killed 2 Springpaw Stalker (${a}, ${b}) and Eversong Tender (${c}) in `,
    );
  });

  test("quest kills are named by creature, not as the quest targets", async () => {
    const t = await field();
    questLog(t.handle, 1, 0);
    cycleKills(t.handle, [done(TENDER)], "objective_complete", () =>
      questLog(t.handle, 1, 1),
    );
    const res = await engageSpec.run(
      { quest: "8325" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.detail).toStartWith(
      `killed Eversong Tender (${t.rt.refs.refOf(TENDER)}) in `,
    );
  });

  test("a kill that completes the quest points at its turn-in", async () => {
    const t = await field();
    t.rt.quests.set(8325, {
      ender: undefined,
      giver: "Magistrix Erona",
      objectives: "",
      title: "Reclaiming Sunstrider Isle",
    });
    questLog(t.handle, 1, 0);
    cycleKills(t.handle, [done(TENDER)], "objective_complete", () => {
      questLog(t.handle, 1, 1);
      const state = t.handle.getQuestState();
      const slots = state.log.slots.map((slot) => ({ ...slot, flags: 1 }));
      t.handle.getQuestState = () => ({
        ...state,
        log: { ...state.log, slots },
      });
    });
    const res = await engageSpec.run(
      { quest: "8325" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.detail).toEndWith(" Quest 8325 complete.");
    expect(res.next).toBe('interact(do: "turn_in", npc: "Magistrix Erona")');
  });

  test("a quest already complete says so instead of naming no kills", async () => {
    const t = await field();
    questLog(t.handle, 1, 1);
    cycleKills(t.handle, [], "objective_complete");
    const res = await engageSpec.run(
      { quest: "8325" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({ status: "DONE" });
    expect(res.detail).toContain("8325");
  });
});
