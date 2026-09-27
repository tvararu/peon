import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { awaitField, fieldClashes, liveClash } from "#harness/grader/fields";
import { loadScenario } from "#harness/grader/scenarios";

const NOW = Date.parse("2026-09-27T05:00:00.000Z");

type Sibling = {
  name: string;
  scenario: string;
  finished?: string;
  t0?: number;
};

async function sibling(
  round: string,
  { name, scenario, finished, t0 = NOW - 60_000 }: Sibling,
): Promise<void> {
  await mkdir(`${round}/${name}/grader`, { recursive: true });
  await writeFile(
    `${round}/${name}/run.json`,
    JSON.stringify({ replica: 1, round: 3, scenario, t0 }),
  );
  if (finished !== undefined)
    await writeFile(`${round}/${name}/${finished}`, "{}");
}

describe("fieldClashes", () => {
  test("two scenarios on one field are refused, naming the pair", () => {
    expect(
      fieldClashes([
        "t7-halt-resume",
        "t0-self-state",
        "t7-question-while-acting",
        "t3-ghostlands-kill",
      ]),
    ).toEqual([
      "t7-halt-resume and t7-question-while-acting share field fairbreeze-stalkers",
    ]);
  });

  test("three scenarios on one field name every pair", () => {
    expect(
      fieldClashes([
        "t7-halt-resume",
        "t7-question-while-acting",
        "t6-die-and-recover",
      ]),
    ).toEqual([
      "t7-halt-resume and t7-question-while-acting share field fairbreeze-stalkers",
      "t7-halt-resume and t6-die-and-recover share field fairbreeze-stalkers",
      "t7-question-while-acting and t6-die-and-recover share field fairbreeze-stalkers",
    ]);
  });

  test("scenarios on different fields go together", () => {
    expect(
      fieldClashes(["t7-halt-resume", "t4-quest-first", "t3-ghostlands-kill"]),
    ).toEqual([]);
  });
});

describe("liveClash", () => {
  const halt = loadScenario("t7-halt-resume");

  test("a running sibling on the same field refuses the run", async () => {
    const round = await mkdtemp(`${tmpdir()}/fields-`);
    await sibling(round, {
      name: "t7-question-while-acting-1",
      scenario: "t7-question-while-acting",
    });
    expect(await liveClash({ now: NOW, round, scenario: halt })).toBe(
      "t7-question-while-acting-1 is still running on field fairbreeze-stalkers; t7-halt-resume shares that field, so run it after that run ends",
    );
  });

  test("finished, stale and other-field siblings do not refuse it", async () => {
    const round = await mkdtemp(`${tmpdir()}/fields-`);
    await sibling(round, {
      finished: "grader/draft.json",
      name: "t6-die-and-recover-1",
      scenario: "t6-die-and-recover",
    });
    await sibling(round, {
      finished: "result.json",
      name: "t3-kill-one-hunter-1",
      scenario: "t3-kill-one-hunter",
    });
    await sibling(round, {
      name: "t7-question-while-acting-1",
      scenario: "t7-question-while-acting",
      t0: NOW - 60 * 60_000,
    });
    await sibling(round, {
      name: "t4-quest-first-1",
      scenario: "t4-quest-first",
    });
    await mkdir(`${round}/empty`);
    expect(
      await liveClash({ now: NOW, round, scenario: halt }),
    ).toBeUndefined();
  });

  test("a scenario with no field never clashes", async () => {
    const round = await mkdtemp(`${tmpdir()}/fields-`);
    await sibling(round, { name: "t0-hostiles-1", scenario: "t0-hostiles" });
    expect(
      await liveClash({
        now: NOW,
        round,
        scenario: loadScenario("t0-self-state"),
      }),
    ).toBeUndefined();
  });

  test("a missing round dir has no clash", async () => {
    const round = `${await mkdtemp(`${tmpdir()}/fields-`)}/none`;
    expect(
      await liveClash({ now: NOW, round, scenario: halt }),
    ).toBeUndefined();
  });
});

describe("awaitField", () => {
  const halt = loadScenario("t7-halt-resume");

  function fakeTime(onSleep: (now: number) => Promise<void> = async () => {}) {
    let now = NOW;
    return {
      clock: { now: () => now },
      sleep: async (ms: number) => {
        now += ms;
        await onSleep(now);
      },
    };
  }

  test("a free field starts at once and logs nothing", async () => {
    const round = await mkdtemp(`${tmpdir()}/fields-`);
    const lines: string[] = [];
    const time = fakeTime();
    await awaitField({
      ...time,
      log: (line) => lines.push(line),
      round,
      scenario: halt,
    });
    expect(lines).toEqual([]);
    expect(time.clock.now()).toBe(NOW);
  });

  test("it queues until the holder finishes, then starts", async () => {
    const round = await mkdtemp(`${tmpdir()}/fields-`);
    await sibling(round, {
      name: "t6-die-and-recover-1",
      scenario: "t6-die-and-recover",
    });
    const lines: string[] = [];
    const time = fakeTime(async (now) => {
      if (now >= NOW + 60_000)
        await writeFile(
          `${round}/t6-die-and-recover-1/grader/draft.json`,
          "{}",
        );
    });
    await awaitField({
      ...time,
      log: (line) => lines.push(line),
      pollMs: 30_000,
      round,
      scenario: halt,
    });
    expect(time.clock.now()).toBe(NOW + 60_000);
    expect(lines).toEqual([
      "waiting for field fairbreeze-stalkers: t6-die-and-recover-1 is still running on field fairbreeze-stalkers; t7-halt-resume shares that field, so run it after that run ends",
      "field fairbreeze-stalkers is free after 60 s",
    ]);
  });

  test("it gives up after the timeout with a clear error", async () => {
    const round = await mkdtemp(`${tmpdir()}/fields-`);
    await sibling(round, {
      name: "t6-die-and-recover-1",
      scenario: "t6-die-and-recover",
      t0: NOW,
    });
    const time = fakeTime();
    await expect(
      awaitField({
        ...time,
        log: () => {},
        pollMs: 60_000,
        round,
        scenario: halt,
        timeoutMs: 5 * 60_000,
      }),
    ).rejects.toThrow(
      "field fairbreeze-stalkers is still held after 5 min: t6-die-and-recover-1 is still running on field fairbreeze-stalkers",
    );
  });
});
