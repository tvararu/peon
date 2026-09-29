import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

type LfgEvent = AreaEventOf<"lfg">;

function harness() {
  const set = areaRuleSet();
  return (event: LfgEvent, now = 1_000_000) =>
    areaDrafts(set, { area: "lfg", event }, testRuleInput({ now }));
}

function rows(event: LfgEvent) {
  return harness()(event);
}

function status(
  over: Partial<Extract<LfgEvent, { type: "status" }>>,
): LfgEvent {
  return {
    previous: "none",
    source: "player",
    status: "queued",
    type: "status",
    updateType: 5,
    ...over,
  };
}

function proposalEvent(
  over: Partial<Extract<LfgEvent, { type: "proposal" }>> = {},
): LfgEvent {
  return {
    deadline: 41_000,
    dungeon: 0x06_00_00_02,
    id: 5,
    selfAccepted: false,
    selfAnswered: false,
    state: 0,
    type: "proposal",
    ...over,
  };
}

describe("lfg harness rules: queue lifecycle", () => {
  test("joining the queue writes one passive lfg/queued row", () => {
    expect(rows(status({}))).toMatchObject([
      { class: "passive", domain: "lfg", event: "lfg/queued" },
    ]);
  });

  test("a status repeat while queued writes no queued row", () => {
    const written = rows(status({ previous: "queued", updateType: 14 }));
    expect(written.map((row) => row.event)).not.toContain("lfg/queued");
  });

  test("a re-queue after a proposal writes a queued row", () => {
    expect(
      rows(status({ previous: "proposal", updateType: 12 })).map(
        (row) => row.event,
      ),
    ).toContain("lfg/queued");
  });

  test.each(["queued", "proposal"] as const)(
    "leaving from %s writes one passive lfg/left row",
    (previous) => {
      expect(
        rows(status({ previous, status: "none", updateType: 7 })),
      ).toMatchObject([{ class: "passive", event: "lfg/left" }]);
    },
  );

  test("a status of none after none is not a leave", () => {
    const written = rows(status({ status: "none", updateType: 14 }));
    expect(written.map((row) => row.event)).not.toContain("lfg/left");
  });

  test("the search flag never writes a queued or left row", () => {
    const events = [
      ...rows(status({ source: "search", updateType: 3 })),
      ...rows(
        status({
          previous: "queued",
          source: "search",
          status: "queued",
          updateType: 2,
        }),
      ),
    ].map((row) => row.event);
    expect(events).not.toContain("lfg/queued");
    expect(events).not.toContain("lfg/left");
  });

  test("a refused join writes a passive lfg/refused row with the reason and locks", () => {
    const [row, ...rest] = rows({
      reason: "deserter",
      result: 12,
      state: 0,
      type: "join_result",
    });
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      class: "passive",
      data: { reason: "deserter", result: 12 },
      event: "lfg/refused",
    });
    expect(row?.text).toContain("deserter");
  });

  test("an accepted join is not a refusal", () => {
    expect(
      rows({ reason: "ok", result: 0, state: 0, type: "join_result" }).map(
        (row) => row.event,
      ),
    ).not.toContain("lfg/refused");
  });
});

describe("lfg harness rules: queue updates", () => {
  const queueEvent = (queuedTime: number): LfgEvent => ({
    dungeon: 0x06_00_00_0c,
    queuedTime,
    type: "queue",
  });

  test("the first queue update writes a passive lfg/queue row naming the wait", () => {
    const [row] = rows(queueEvent(240));
    expect(row).toMatchObject({
      class: "passive",
      data: { queuedTime: 240 },
      event: "lfg/queue",
    });
    expect(row?.text).toContain("4 min");
  });

  test("a wait under a minute reads in seconds", () => {
    expect(rows(queueEvent(16))[0]?.text).toContain("16 s");
  });

  test("queue updates within 60 s write nothing more", () => {
    const write = harness();
    expect(write(queueEvent(8), 1_000_000)).toHaveLength(1);
    expect(write(queueEvent(16), 1_008_000)).toEqual([]);
    expect(write(queueEvent(56), 1_059_000)).toEqual([]);
    expect(write(queueEvent(64), 1_060_000)).toHaveLength(1);
  });

  test("leaving and queueing again restarts the throttle", () => {
    const write = harness();
    write(queueEvent(8), 1_000_000);
    write(status({ previous: "queued", status: "none", updateType: 7 }));
    write(status({}));
    expect(write(queueEvent(8), 1_001_000)).toHaveLength(1);
  });
});

describe("lfg harness rules: prompts", () => {
  test("an open proposal wakes with its deadline", () => {
    const [row, ...rest] = rows(proposalEvent());
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      class: "wake",
      data: { deadline: 41_000, dungeon: 0x06_00_00_02, id: 5, state: 0 },
      event: "lfg/proposal",
    });
  });

  test.each([1, 2])("a proposal in state %i does not wake", (state) => {
    expect(rows(proposalEvent({ state }))).toMatchObject([
      { class: "log", data: { state }, event: "lfg/proposal" },
    ]);
  });

  test("a proposal the character already answered does not wake", () => {
    expect(
      rows(proposalEvent({ selfAccepted: true, selfAnswered: true })),
    ).toMatchObject([{ class: "log", event: "lfg/proposal" }]);
  });

  test("proposal rows differ between an open, failed and successful proposal", () => {
    const texts = [0, 1, 2].map(
      (state) => rows(proposalEvent({ state }))[0]?.text ?? "",
    );
    expect(new Set(texts).size).toBe(3);
  });

  test("a role check start wakes and a later state does not", () => {
    expect(
      rows({ state: 2, stateName: "initializing", type: "role_check" }),
    ).toMatchObject([
      { class: "wake", data: { stateName: "initializing" } },
    ]);
    expect(
      rows({ state: 1, stateName: "finished", type: "role_check" })[0]?.class,
    ).toBe("log");
  });

  test("an open kick vote wakes with its deadline and the counts", () => {
    const [row] = rows({
      agrees: 1,
      deadline: 122_000,
      inProgress: true,
      needed: 3,
      type: "boot_vote",
      victim: 0xabn,
      votes: 2,
    });
    expect(row).toMatchObject({
      class: "wake",
      data: {
        agrees: 1,
        deadline: 122_000,
        inProgress: true,
        needed: 3,
        victim: "171",
        votes: 2,
      },
      event: "lfg/boot_vote",
    });
  });

  test("an ended kick vote does not wake and reads differently", () => {
    const base = {
      agrees: 3,
      deadline: undefined,
      needed: 3,
      type: "boot_vote",
      victim: 1n,
      votes: 3,
    } as const;
    const open = rows({ ...base, deadline: 9, inProgress: true })[0];
    const ended = rows({ ...base, inProgress: false })[0];
    expect(ended?.class).toBe("log");
    expect(ended?.text).not.toBe(open?.text);
  });
});

describe("lfg harness rules: other events", () => {
  test("a teleport denial writes a passive lfg/teleport_refused row with the reason and code", () => {
    const [row] = rows({
      code: 6,
      reason: "invalid_location",
      type: "teleport_denied",
    });
    expect(row).toMatchObject({
      class: "passive",
      data: { code: 6, reason: "invalid_location" },
      event: "lfg/teleport_refused",
    });
    expect(row?.text).toContain("invalid_location");
  });

  test("offer continue writes one row with the dungeon entry", () => {
    expect(
      rows({ entry: 0x01_00_00_10, type: "offer_continue" }),
    ).toMatchObject([
      { data: { entry: 0x01_00_00_10 }, event: "lfg/offer_continue" },
    ]);
  });

  test("a reward writes a progress log row with money, xp and the item count", () => {
    expect(
      rows({
        dungeon: 2,
        itemCount: 2,
        money: 4321,
        randomDungeon: 1,
        type: "reward",
        xp: 900,
      }),
    ).toMatchObject([
      {
        class: "log",
        data: {
          dungeon: 2,
          itemCount: 2,
          money: 4321,
          randomDungeon: 1,
          xp: 900,
        },
        event: "lfg/reward",
        progress: true,
      },
    ]);
  });

  test("a dungeon list arrival writes no row", () => {
    expect(rows({ scope: "player", type: "dungeons" })).toEqual([]);
    expect(rows({ scope: "party", type: "dungeons" })).toEqual([]);
  });
});
