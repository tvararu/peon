import { describe, expect, test } from "bun:test";
import type { EngageAfter } from "#harness/contract/details";
import type { CycleTargetRecord } from "#harness/loops/encounter-cycle";
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
  setSelf,
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
      /^DONE killed Springpaw Stalker \(u\d+\) in 0 s, server kill credit\. \+108 XP\. Looted Broken Fang x1, 12 copper\. You: HP 200\/200, mana 300\/300 \(100%\)\.$/,
    );
    expect(res.after).toMatchObject({ kills: 1, mode: "single", xp: 108 });
  });

  test("a gray kill is DONE with no XP", async () => {
    const t = await field();
    tactics(t.handle, (runId) =>
      outcome(t.handle, runId, { reason: "gray", status: "completed" }),
    );
    const res = await engageSpec.run(
      { loot: false, target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.status).toBe("DONE");
    expect(res.detail).toMatch(
      /^killed Springpaw Stalker \(u\d+\); no XP \(gray target\)\. You: HP/,
    );
    expect(res.after).toMatchObject({
      kills: 1,
      targets: [{ outcome: "killed", reason: "gray", xp: 0 }],
    });
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
      /^Springpaw Stalker \(u\d+\) killed you 0 s into the fight\. You are dead at 0, 0\.$/,
    );
  });

  test("breath_low fails the fight with the surface line", async () => {
    const t = await field();
    tactics(t.handle, () => {
      t.handle.triggerAreaEvent("selfstate", {
        remainingMs: 6200,
        type: "breath_low",
      });
    });
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({
      next: "look()",
      reason: "interrupted",
      status: "FAILED",
    });
    expect(res.detail).toBe("Surface now: you have 7 s of breath.");
  });

  test("death after an approach gives the fight time and the walk apart", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45)]);
    driveGoto(t.handle, [
      { arrive: { x: 25, y: 0 }, onArrive: () => t.clock.advance(10_000) },
    ]);
    tactics(t.handle, () => {
      t.clock.advance(11_000);
      attackBy(t.handle, STALKER);
      die(t.handle);
    });
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.detail).toMatch(
      /^Springpaw Stalker \(u\d+\) killed you 11 s into the fight \(you walked 25 yd first\)\. You are dead at 25, 0\.$/,
    );
  });

  test("a kill after an approach counts only the fight time", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45)]);
    driveGoto(t.handle, [
      { arrive: { x: 25, y: 0 }, onArrive: () => t.clock.advance(10_000) },
    ]);
    tactics(t.handle, (runId) => {
      t.clock.advance(7000);
      outcome(t.handle, runId, KILL);
    });
    const res = await engageSpec.run(
      { loot: false, target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.detail).toMatch(
      /^killed Springpaw Stalker \(u\d+\) in 7 s, server kill credit\./,
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

  test("a gray kill in a cycle names the no-XP kill and drops target", async () => {
    const t = await field();
    cycleEnds(
      t.handle,
      [
        {
          guid: STALKER,
          loot: "none",
          outcome: { reason: "gray", status: "completed" },
          status: "done",
        },
      ],
      "queue_exhausted",
    );
    const res = await engageSpec.run({ count: 2 }, toolCtx<EngageAfter>(t));
    expect(res.status).toBe("PARTLY");
    const ref = t.rt.refs.refOf(STALKER);
    expect(res.detail).toMatch(
      new RegExp(
        `^1 of 2 kills \\(${ref}\\); no XP for ${ref} \\(gray target\\)\\. Stopped:`,
      ),
    );
    expect(res.next).toBe("engage(count: 1)");
  });

  test("an unnamed cycle does not refill with a gray same-name unit", async () => {
    const t = await field();
    setSelf(t.handle, { level: 20 });
    setUnits(t.handle, [
      unitRow({
        distance: 22,
        entry: 15_366,
        guid: STALKER,
        level: 9,
        name: "Springpaw Stalker",
        x: 22,
        y: 0,
      }),
      unitRow({
        distance: 28,
        entry: 15_366,
        guid: STALKER_2,
        level: 9,
        name: "Springpaw Stalker",
        x: 28,
        y: 0,
      }),
    ]);
    const calls: bigint[][] = [];
    const base = t.handle.getCycleState();
    t.handle.startCycle = (guids) => {
      calls.push([...guids]);
      const records: CycleTargetRecord[] = [
        { guid: STALKER, loot: "none", outcome: KILL, status: "done" },
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
    const res = await engageSpec.run({ count: 2 }, toolCtx<EngageAfter>(t));
    expect(calls.flat()).not.toContain(STALKER_2);
    expect(res.next ?? "").not.toContain("target");
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
      /^Springpaw Stalker u\d+ is not in view any more; it may have died or despawned\. You walked 20 yd; the fight did not start\.$/,
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

  test("an unreachable target with another creature in view points at it", async () => {
    const t = await field();
    const lynx = unitRow({
      distance: 30,
      guid: LYNX,
      level: 7,
      name: "Springpaw Lynx",
      x: 30,
      y: 0,
    });
    setUnits(t.handle, [stalker(STALKER, 45), lynx]);
    driveGoto(t.handle, [{ refuse: "stop: ground corridor changes surface" }]);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.next).toBe(`engage(target: "${t.rt.refs.refOf(LYNX)}")`);
  });

  test("an unreachable target with nothing else in view sends the agent exploring", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45)]);
    driveGoto(t.handle, [{ refuse: "stop: ground corridor changes surface" }]);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.next).toBe('travel(to: "explore")');
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
      "engage 0 of 1 kills. You: HP 200/200, mana 300/300 (100%), at 0, 0.",
    );
    t.rt.runs.cancel(res.runId ?? "", "tool");
  });
});
