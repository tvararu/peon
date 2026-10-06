import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

const INPUT = testRuleInput();
const SET = areaRuleSet();

function draftOf(event: unknown) {
  return areaDrafts(SET, { area: "arena", event } as unknown as AreaEvent, INPUT);
}

describe("arena harness rules", () => {
  test("an invite wakes the agent with the inviter and team", () => {
    const out = draftOf({ inviter: "Boss", team: "Axes", type: "invited" });
    expect(out).toMatchObject([
      { class: "wake", domain: "arena", event: "arena/invited" },
    ]);
    expect(out[0]?.text).toContain("Boss");
    expect(out[0]?.text).toContain("Axes");
  });

  test("team events log join, kick and disband text", () => {
    const join = draftOf({
      event: 3,
      name: "join",
      strings: ["Ann", "Axes"],
      type: "team_event",
    });
    expect(join[0]).toMatchObject({ class: "log", event: "arena/team_event" });
    expect(join[0]?.text).toBe("Ann joined Axes.");
    const kick = draftOf({
      event: 5,
      name: "remove",
      strings: ["Ann", "Axes", "Boss"],
      type: "team_event",
    });
    expect(kick[0]?.text).toBe("Ann was kicked out of Axes by Boss.");
    const gone = draftOf({
      event: 8,
      name: "disbanded",
      strings: ["Boss", "Axes"],
      type: "team_event",
    });
    expect(gone[0]?.text).toBe("Boss disbanded Axes.");
    const other = draftOf({
      event: 99,
      name: "odd",
      strings: ["a"],
      type: "team_event",
    });
    expect(other[0]?.text).toContain("odd");
  });

  test("a failed command result wakes; a good one logs", () => {
    const bad = draftOf({
      result: {
        action: "invite",
        error: "permissions",
        ok: false,
        player: "",
        team: "Axes",
      },
      type: "result",
    });
    expect(bad[0]).toMatchObject({ class: "wake", event: "arena/refused" });
    expect(bad[0]?.text).toContain("permissions");
    const good = draftOf({
      result: { action: "quit", error: "ok", ok: true, player: "", team: "" },
      type: "result",
    });
    expect(good[0]).toMatchObject({ class: "log", event: "arena/result" });
  });

  test("arena_error names the team size or the missing team", () => {
    expect(draftOf({ arenaType: 2, type: "arena_error" })[0]?.text).toContain(
      "2v2",
    );
    expect(
      draftOf({ arenaType: undefined, type: "arena_error" })[0]?.text,
    ).toContain("not in an arena team");
  });

  test("queue rows log only when a slot is queued; a refused join wakes", () => {
    expect(
      draftOf({
        queue: [{ arenaType: 2, kind: "none", rated: false, slot: 0 }],
        type: "queue",
      }),
    ).toEqual([]);
    const queued = draftOf({
      queue: [{ arenaType: 2, kind: "queued", rated: false, slot: 1 }],
      type: "queue",
    });
    expect(queued[0]).toMatchObject({ class: "log", event: "arena/queue" });
    expect(queued[0]?.text).toContain("slot 1");
    expect(draftOf({ result: -5, type: "queue_refused" })[0]).toMatchObject({
      class: "wake",
      event: "arena/queue_refused",
    });
  });

  test("team, stats, roster and inspect events write no rows", () => {
    for (const type of ["team", "stats", "roster", "inspect"])
      expect(draftOf({ type })).toEqual([]);
  });
});
