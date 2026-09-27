import { describe, expect, test } from "bun:test";
import type { CycleTargetRecord } from "@tuicraft/core";
import type { EngageAfter } from "#harness/contract/details";
import { engageSpec } from "#harness/tools/engage";
import {
  cycleEnds,
  field,
  KILL,
  LYNX,
  lootsFang,
  outcome,
  STALKER,
  STALKER_2,
  stalker,
  tactics,
  xp,
} from "#test-support/engage-fixtures";
import {
  attackBy,
  contentOf,
  die,
  driveGoto,
  limitProblem,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";

describe("engage fight", () => {
  test("one kill: kill credit, XP and loot in one DONE line", async () => {
    const t = await field();
    tactics(t.handle, (runId) => {
      xp(t.handle, STALKER, 108);
      outcome(t.handle, runId, KILL);
    });
    lootsFang(t.handle);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(text).toMatch(
      /^DONE killed Springpaw Stalker \(u\d+\) in 0 s, server kill credit\. \+108 XP\. Looted Broken Fang x1, 12 copper\. You: HP 200\/200, mana 100%\.$/,
    );
    expect(res.after).toMatchObject({ kills: 1, mode: "single", xp: 108 });
  });

  test("death during the fight fails with the recover step", async () => {
    const t = await field();
    tactics(t.handle, () => {
      attackBy(t.handle, STALKER);
      die(t.handle);
    });
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({
      next: "recover()",
      reason: "died",
      status: "FAILED",
    });
    expect(res.detail).toMatch(
      /^Springpaw Stalker \(u\d+\) killed you after 0 s\. You are dead at 0, 0\.$/,
    );
  });

  test("Jev timing out 3 times maps to jev_unavailable", async () => {
    const t = await field();
    tactics(t.handle, (runId) =>
      outcome(t.handle, runId, { reason: "jev_timeout", status: "failed" }),
    );
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({ reason: "jev_unavailable", status: "FAILED" });
  });

  test("count 3 runs a cycle and reports PARTLY with the kills it got", async () => {
    const t = await field();
    cycleEnds(
      t.handle,
      [
        { guid: STALKER, loot: "looted", outcome: KILL, status: "done" },
        { guid: STALKER_2, loot: "looted", outcome: KILL, status: "done" },
      ],
      "queue_exhausted",
    );
    const res = await engageSpec.run(
      { count: 3, target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(limitProblem(contentOf(res))).toBeUndefined();
    expect(res).toMatchObject({
      next: 'travel(to: "explore"), then engage(count: 1, target: "Springpaw Stalker")',
      reason: "queue_exhausted",
      status: "PARTLY",
    });
    expect(res.detail).toMatch(
      /^2 of 3 kills \(u\d+, u\d+\)\. Stopped: no more Springpaw Stalker in view; 1 kill still needed\./,
    );
  });

  test("a target that left view is never fought", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45)]);
    driveGoto(t.handle, [
      { arrive: { x: 20, y: 0 }, onArrive: () => setUnits(t.handle, []) },
    ]);
    let started = 0;
    t.handle.startTactics = async () => {
      started += 1;
    };
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(started).toBe(0);
    expect(res).toMatchObject({
      next: 'travel(to: "explore")',
      reason: "target_not_observed",
      status: "FAILED",
    });
    expect(res.detail).toMatch(
      /^Springpaw Stalker u\d+ is not in view any more; the fight did not start\.$/,
    );
  });

  test("an unreachable target points at another one in view", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45), stalker(STALKER_2, 48)]);
    driveGoto(t.handle, [{ refuse: "stop: ground corridor changes surface" }]);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    const other = t.rt.refs.refOf(STALKER_2);
    expect(res).toMatchObject({
      next: `engage(target: "${other}")`,
      reason: "surface_change",
      status: "FAILED",
    });
  });

  test("an unreachable target with no other in view asks the human", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45)]);
    driveGoto(t.handle, [{ refuse: "stop: ground corridor changes surface" }]);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.next).toBe(
      'ask the human: "I cannot reach Springpaw Stalker from here. Is there another way?"',
    );
  });

  test("a map without navigation data asks the human, not another target", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45), stalker(STALKER_2, 48)]);
    driveGoto(t.handle, [
      { refuse: "stop: unsupported map 0 (only Expansion01/530)" },
    ]);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.next).toMatch(/^ask the human: "This map has no navigation/);
  });

  test("a start off the mesh points at unstick", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45)]);
    driveGoto(t.handle, [
      { refuse: "stop: start snapped off the requested ground position" },
    ]);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'travel(to: "unstick")',
      reason: "start_off_mesh",
    });
  });

  test("an item quest with no known source refuses with the ask for a creature", async () => {
    const t = await field();
    const state = t.handle.getQuestState();
    const counters: [number, number, number, number] = [0, 0, 0, 0];
    t.handle.getQuestState = () => ({
      ...state,
      log: {
        complete: true,
        slots: [
          { counters, expiresAtSeconds: 0, flags: 0, questId: 8325, slot: 0 },
        ],
      },
    });
    cycleEnds(t.handle, [], "objective_item_sources_unknown");
    const res = await engageSpec.run(
      { quest: "8325" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'engage(quest: "8325", target: "<creature name>")',
      reason: "item_sources_unknown",
      status: "REFUSED",
    });
  });

  test("a second attacker after a single kill is named with an engage step", async () => {
    const t = await field();
    setUnits(t.handle, [
      stalker(STALKER, 22),
      unitRow({
        distance: 8,
        guid: LYNX,
        level: 6,
        name: "Springpaw Lynx",
        x: 8,
        y: 0,
      }),
    ]);
    tactics(t.handle, (runId) => {
      attackBy(t.handle, LYNX);
      outcome(t.handle, runId, KILL);
    });
    t.handle.lootCorpse = async () => ({ ok: true, record: undefined });
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.status).toBe("DONE");
    expect(res.body ?? []).toEqual([]);
    expect(res.next).toMatch(/^engage\(target: "u\d+"\)$/);
  });

  test("a new attacker mid-cycle leads the next cycle while kills remain", async () => {
    const t = await field();
    setUnits(t.handle, [
      stalker(STALKER, 22),
      stalker(STALKER_2, 28),
      unitRow({
        distance: 8,
        guid: LYNX,
        level: 6,
        name: "Springpaw Lynx",
        x: 8,
        y: 0,
      }),
    ]);
    const calls: bigint[][] = [];
    const base = t.handle.getCycleState();
    t.handle.startCycle = (guids) => {
      calls.push([...guids]);
      const first = calls.length === 1;
      if (first) attackBy(t.handle, LYNX);
      const records: CycleTargetRecord[] = [
        {
          guid: first ? STALKER : LYNX,
          loot: "looted",
          outcome: KILL,
          status: "done",
        },
      ];
      const stopped = {
        ...base,
        active: false,
        phase: "stopped" as const,
        queue: records,
        stopCause: "queue_exhausted",
      };
      queueMicrotask(() => {
        t.handle.getCycleState = () => stopped;
        t.handle.triggerCycleEvent({ at: 0, state: stopped, type: "stopped" });
      });
      return Promise.resolve();
    };
    const res = await engageSpec.run(
      { count: 2, target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(calls[0]).toEqual([STALKER, STALKER_2]);
    expect(calls[1]?.[0]).toBe(LYNX);
    expect(res.status).not.toBe("FAILED");
  });

  test("human text yields RUNNING with vitals while the fight goes on", async () => {
    const t = await field();
    tactics(t.handle, undefined);
    const pending = engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    t.rt.yields.trigger();
    const res = await pending;
    expect(res.status).toBe("RUNNING");
    expect(res.detail).toBe(
      "engage 0 of 1 kills. You: HP 200/200, mana 100%, at 0, 0.",
    );
    t.rt.runs.cancel(res.runId ?? "", "tool");
  });
});
