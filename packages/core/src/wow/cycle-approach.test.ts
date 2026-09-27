import { expect, test } from "bun:test";
import { type ApproachDeps, approachUnit } from "#wow/cycle-approach";

type Nav = { active: boolean; blockedReason: string | undefined };

function fake(init: {
  gaps: number[];
  refuse?: string;
  blockedAtEnd?: string;
}) {
  const calls: string[] = [];
  let tick = 0;
  let nav: Nav = { active: false, blockedReason: undefined };
  const deps: ApproachDeps = {
    gap: () => init.gaps[Math.min(tick, init.gaps.length - 1)] ?? Number.NaN,
    goTo: (guid) => {
      calls.push(`goto ${guid}`);
      if (init.refuse) throw new Error(`stop: ${init.refuse}`);
      nav = { active: true, blockedReason: undefined };
    },
    halt: (reason) => {
      calls.push(`halt ${reason}`);
      nav = { active: false, blockedReason: undefined };
    },
    navigation: () => nav,
    tick: async () => {
      tick++;
      if (tick >= init.gaps.length - 1 && init.blockedAtEnd !== undefined)
        nav = { active: false, blockedReason: init.blockedAtEnd };
    },
  };
  return { calls, deps };
}

test("does not route to a target already within reach", async () => {
  const { calls, deps } = fake({ gaps: [20] });
  const signal = new AbortController().signal;
  expect(await approachUnit(deps, 7n, signal)).toBeUndefined();
  expect(calls).toEqual([]);
});

test("routes to an 80 yd target and stops within 25 yd", async () => {
  const { calls, deps } = fake({ gaps: [80, 60, 40, 24] });
  const signal = new AbortController().signal;
  expect(await approachUnit(deps, 7n, signal)).toBeUndefined();
  expect(calls).toEqual(["goto 7", "halt cycle_approach"]);
});

test("names a refused route as unreachable", async () => {
  const { deps } = fake({ gaps: [80], refuse: "pathfind_find_path failed" });
  const signal = new AbortController().signal;
  expect(await approachUnit(deps, 7n, signal)).toBe("target_unreachable");
});

test("names a route that stops short on a refusal as unreachable", async () => {
  const { deps } = fake({ blockedAtEnd: "obstructed", gaps: [80, 70, 60] });
  const signal = new AbortController().signal;
  expect(await approachUnit(deps, 7n, signal)).toBe("target_unreachable");
});

test("halts the route when the cycle is stopped", async () => {
  const { calls, deps } = fake({ gaps: [80, 80, 80, 80] });
  const run = new AbortController();
  const done = approachUnit(deps, 7n, run.signal);
  run.abort();
  expect(await done).toBeUndefined();
  expect(calls).toEqual(["goto 7", "halt cycle_approach"]);
});
