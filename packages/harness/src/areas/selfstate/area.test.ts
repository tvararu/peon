import { describe, expect, test } from "bun:test";
import type { AreaEvent, AreaEventOf, AreaState } from "@peon/core";
import { areaDrafts, areaRuleSet, attachDrafts } from "#harness/areas/rules";
import { createMockGame } from "#test-support/mock-game";
import { testRuleInput } from "#test-support/rule-fixtures";

const NOW = 1_000_000;
const BREATH = {
  at: NOW,
  maxMs: 60_000,
  paused: false,
  scale: -1,
  spellId: 0,
  valueMs: 60_000,
};
const IDLE: AreaState<"selfstate"> = {
  collisionHeight: undefined,
  ghostPending: false,
  lastTransferAbort: undefined,
  mountDisplayId: 0,
  mounted: false,
  selfResSpell: 0,
  standState: "stand",
  timers: {},
};

function drafts(event: AreaEventOf<"selfstate">) {
  const wrapped: AreaEvent = { area: "selfstate", event };
  return areaDrafts(areaRuleSet(), wrapped, testRuleInput({ now: NOW }));
}

function attached(state: AreaState<"selfstate">) {
  const base = createMockGame();
  const game = Object.assign(base, {
    selfstate: { ...base.selfstate, state: () => state },
  });
  return attachDrafts(areaRuleSet(), game, testRuleInput({ now: NOW })).filter(
    (row) => row.domain === "selfstate",
  );
}

describe("selfstate harness rules", () => {
  test("a started breath timer wakes the agent with the seconds left", () => {
    const rows = drafts({
      change: "started",
      timer: "breath",
      type: "mirror_timer",
      value: BREATH,
    });
    expect<unknown[]>(rows).toEqual([
      {
        class: "wake",
        data: { remainingS: 60, timer: "breath" },
        domain: "selfstate",
        event: "selfstate/under_water",
        text: "You are under water: breath 60 s.",
      },
    ]);
  });

  test("a stopped breath timer logs that the agent can breathe", () => {
    const rows = drafts({
      change: "stopped",
      timer: "breath",
      type: "mirror_timer",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      text: "You can breathe again.",
    });
  });

  test("breath_low wakes the agent to surface", () => {
    const rows = drafts({ remainingMs: 9600, type: "breath_low" });
    expect<unknown[]>(rows).toEqual([
      {
        class: "wake",
        data: { remainingS: 10 },
        domain: "selfstate",
        event: "selfstate/breath_low",
        text: "Breath 10 s left. Surface now.",
      },
    ]);
  });

  test("a refused transfer wakes the agent with the map and the reason", () => {
    const rows = drafts({
      arg: undefined,
      at: NOW,
      mapId: 36,
      reason: 2,
      type: "transfer_aborted",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      data: { mapId: 36, reason: 2 },
      event: "selfstate/transfer_aborted",
      text: "Could not enter map 36: the instance is full.",
    });
  });

  test("an unknown abort reason still names the map and the reason number", () => {
    const [row] = drafts({
      arg: undefined,
      at: NOW,
      mapId: 229,
      reason: 99,
      type: "transfer_aborted",
    });
    expect(row?.text).toBe("Could not enter map 229: reason 99.");
  });

  test("an available self-resurrection spell logs the way back with its name", () => {
    const rows = drafts({
      name: "Reincarnation",
      spellId: 21_169,
      type: "self_res_available",
    });
    expect<unknown[]>(rows).toEqual([
      {
        class: "log",
        data: { name: "Reincarnation", spellId: 21_169 },
        domain: "selfstate",
        event: "selfstate/self_res_available",
        text: "You can come back where you died (Reincarnation).",
      },
    ]);
  });

  test("a mount and a dismount log their rows", () => {
    const [up] = drafts({ displayId: 14_337, taxi: false, type: "mounted" });
    const [down] = drafts({ taxi: false, type: "dismounted" });
    expect(up).toMatchObject({
      class: "log",
      data: { displayId: 14_337 },
      event: "selfstate/mounted",
    });
    expect(down).toMatchObject({ class: "log", event: "selfstate/dismounted" });
  });

  test("a taxi flight's mount and dismount write no row", () => {
    expect(drafts({ displayId: 14_337, taxi: true, type: "mounted" })).toEqual(
      [],
    );
    expect(drafts({ taxi: true, type: "dismounted" })).toEqual([]);
  });

  test("another rider's animation writes no row", () => {
    expect(drafts({ guid: 7n, type: "mount_anim" })).toEqual([]);
  });

  test("an unnamed self-resurrection spell falls back to its id", () => {
    const [row] = drafts({
      name: undefined,
      spellId: 20_707,
      type: "self_res_available",
    });
    expect(row?.text).toBe("You can come back where you died (spell 20707).");
  });

  test("stand changes and a pending ghost write no row", () => {
    expect(drafts({ from: "stand", to: "sit", type: "stand_changed" })).toEqual(
      [],
    );
    expect(drafts({ type: "ghost_pending" })).toEqual([]);
  });

  test("a fatigue timer writes no breath row", () => {
    const rows = drafts({
      change: "started",
      timer: "fatigue",
      type: "mirror_timer",
      value: BREATH,
    });
    expect(rows.filter((row) => row.event === "selfstate/under_water")).toEqual(
      [],
    );
  });

  test.each([
    ["paused", { paused: true }],
    ["refilling", { scale: 10 }],
  ])("a started %s breath timer writes no under-water row", (_, change) => {
    const rows = drafts({
      change: "started",
      timer: "breath",
      type: "mirror_timer",
      value: { ...BREATH, ...change },
    });
    expect(rows).toEqual([]);
  });

  test.each([
    ["paused", { paused: true }],
    ["refilling", { scale: 10 }],
  ])("attach with a %s breath timer writes no row", (_, change) => {
    const rows = attached({
      ...IDLE,
      timers: { breath: { ...BREATH, ...change, at: NOW - 20_000 } },
    });
    expect(rows).toEqual([]);
  });
  test("attach with a draining breath timer writes one row with the time left", () => {
    const rows = attached({
      ...IDLE,
      timers: { breath: { ...BREATH, at: NOW - 20_000 } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      data: { remainingS: 40, timer: "breath" },
      event: "selfstate/under_water",
    });
  });

  test("attach writes nothing when no breath timer runs", () => {
    expect(attached(IDLE)).toEqual([]);
  });
});
