import { describe, expect, test } from "bun:test";
import { scratchDir } from "@peon/core/test-support/scratch";
import type { Exec, ExecResult } from "#harness/grader/exec";
import {
  newPartnerTrack,
  type Partner,
  type PartnerTrack,
  sequentialActions,
  stepPartner,
} from "#harness/grader/partner";
import type { PartnerAction } from "#harness/grader/scenarios";
import type { TriggerRow } from "#harness/grader/watch";

const START = Date.parse("2026-09-28T02:00:00.000Z");
const AGENT = {
  account: "FAC0A",
  character: "Fevala",
  preset: "ghostlands20",
  wrapper: "/wt/tmp/puppet-A",
};
const PARTNERS: Partner[] = [1, 2, 3, 4].map((n) => ({
  kind: "partner",
  names: {
    account: `FAC0${n}`,
    character: `Partner${n}`,
    preset: "ghostlands20",
    wrapper: `/wt/tmp/puppet-${n}`,
  },
  role: `partner${n}` as Partner["role"],
}));

const answer = (actor: number, roles: number): PartnerAction => ({
  actor,
  argv: ["call", "setRoles", `[${roles}]`],
  at: { delayMs: 2000, kind: "trigger", trigger: "lfg_role_check" },
  reactive: true,
  windowMs: 10_000,
});
const ACTIONS = [answer(1, 2), answer(2, 4), answer(3, 8), answer(4, 8)];

const wake = (ms: number): TriggerRow => ({
  ms,
  seq: ms,
  state: 2,
  text: "A role check started",
  trigger: "lfg_role_check",
});

const settle = (ms: number, state: number): TriggerRow => ({
  ms,
  seq: ms,
  state,
  text: "The role check changed.",
  trigger: "lfg_role_check",
});

type Rig = {
  calls: string[];
  rows: () => Promise<Record<string, unknown>[]>;
  step: (now: number, triggers: TriggerRow[]) => Promise<void>;
  track: PartnerTrack;
};

function rig(
  actions: readonly PartnerAction[],
  reply: ExecResult = { code: 0, stderr: "", stdout: "" },
): Rig {
  const calls: string[] = [];
  const exec: Exec = (argv) => {
    if (argv[1] !== "read") calls.push(argv.join(" "));
    return Promise.resolve(
      argv[1] === "read" ? { code: 0, stderr: "", stdout: "[]" } : reply,
    );
  };
  const runDir = scratchDir("partner-reactive");
  const track = newPartnerTrack(START);
  return {
    calls,
    rows: async () => {
      const file = Bun.file(`${runDir}/steers.jsonl`);
      if (!(await file.exists())) return [];
      return (await file.text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
    step: (now, triggers) =>
      stepPartner({
        actions,
        agent: AGENT,
        clock: { now: () => now },
        exec,
        partners: PARTNERS,
        runDir,
        track,
        triggers,
      }),
    track,
  };
}

const answered = (calls: string[]) =>
  calls
    .map((line) => {
      const [wrapper, , , roles] = line.split(" ");
      return `${wrapper} ${roles}`;
    })
    .sort();

describe("reactive partner actions", () => {
  test("every partner answers a role check from the one wake, none waiting on another", async () => {
    const t = rig(ACTIONS);
    const triggers = [wake(START + 1000)];
    await t.step(START + 2999, triggers);
    expect(t.calls).toEqual([]);
    await t.step(START + 3000, triggers);
    expect(answered(t.calls)).toEqual([
      "/wt/tmp/puppet-1 [2]",
      "/wt/tmp/puppet-2 [4]",
      "/wt/tmp/puppet-3 [8]",
      "/wt/tmp/puppet-4 [8]",
    ]);
    expect(t.track.cursor.index).toBe(0);
  });

  test("a partner's answer does not depend on the order the wakes arrive in", async () => {
    const t = rig([answer(3, 8), answer(1, 2)]);
    await t.step(START + 5000, [wake(START + 1000)]);
    expect(answered(t.calls)).toEqual([
      "/wt/tmp/puppet-1 [2]",
      "/wt/tmp/puppet-3 [8]",
    ]);
  });

  test("the wakes one answer provokes do not repeat it", async () => {
    const t = rig(ACTIONS);
    const triggers = [wake(START + 1000)];
    await t.step(START + 3000, triggers);
    triggers.push(wake(START + 4000), wake(START + 6000));
    await t.step(START + 9000, triggers);
    expect(t.calls).toHaveLength(4);
  });

  test("a later role check is answered again", async () => {
    const t = rig(ACTIONS);
    const triggers = [wake(START + 1000)];
    await t.step(START + 3000, triggers);
    triggers.push(wake(START + 47_000));
    await t.step(START + 48_000, triggers);
    expect(t.calls).toHaveLength(4);
    await t.step(START + 49_000, triggers);
    expect(t.calls).toHaveLength(8);
    expect(await t.rows()).toHaveLength(8);
  });

  test("a wake from before the track began is not answered", async () => {
    const t = rig(ACTIONS);
    await t.step(START + 9000, [wake(START - 5000)]);
    expect(t.calls).toEqual([]);
  });

  test("a failed answer is a graded row and the run goes on", async () => {
    const t = rig(ACTIONS, { code: 1, stderr: "no_role_check", stdout: "" });
    await t.step(START + 3000, [wake(START + 1000)]);
    expect((await t.rows()).map((row) => row["code"])).toEqual([1, 1, 1, 1]);
  });

  test("sequential actions keep their own order around reactive ones", async () => {
    const invite: PartnerAction = {
      argv: ["call", "invite", '["x"]'],
      at: { kind: "elapsed", ms: 1000 },
      windowMs: 5000,
    };
    const actions = [invite, ...ACTIONS];
    expect(sequentialActions(actions)).toEqual([invite]);
    const t = rig(actions);
    await t.step(START + 1000, []);
    expect(t.track.cursor.index).toBe(1);
  });

  test("a partner whose command is still pending does not hold back the others", async () => {
    let release = () => {};
    const until = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = () => {};
    const allStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const calls: string[] = [];
    const slow: Exec = async (argv) => {
      if (argv[1] === "read") return { code: 0, stderr: "", stdout: "[]" };
      calls.push(argv.join(" "));
      if (calls.length === ACTIONS.length) started();
      if (argv[0] === "/wt/tmp/puppet-1") await until;
      return { code: 0, stderr: "", stdout: "" };
    };
    const runDir = scratchDir("partner-reactive");
    const track = newPartnerTrack(START);
    const stepping = stepPartner({
      actions: ACTIONS,
      agent: AGENT,
      clock: { now: () => START + 3000 },
      exec: slow,
      partners: PARTNERS,
      runDir,
      track,
      triggers: [wake(START + 1000)],
    });
    await allStarted;
    expect(answered(calls)).toEqual([
      "/wt/tmp/puppet-1 [2]",
      "/wt/tmp/puppet-2 [4]",
      "/wt/tmp/puppet-3 [8]",
      "/wt/tmp/puppet-4 [8]",
    ]);
    release();
    await stepping;
    expect(track.reactedSeq).toEqual([
      START + 1000,
      START + 1000,
      START + 1000,
      START + 1000,
    ]);
  });

  test("a check cancelled and reopened within ten seconds is answered by all four again", async () => {
    const t = rig(ACTIONS);
    const triggers = [wake(START + 1000)];
    await t.step(START + 3000, triggers);
    expect(t.calls).toHaveLength(4);
    triggers.push(settle(START + 5000, 5), wake(START + 7000));
    await t.step(START + 9000, triggers);
    expect(t.calls).toHaveLength(8);
    await t.step(START + 30_000, triggers);
    expect(t.calls).toHaveLength(8);
  });

  test("a terminal update does not consume the reaction to the next check", async () => {
    const t = rig(ACTIONS);
    const triggers = [wake(START + 1000)];
    await t.step(START + 3000, triggers);
    triggers.push(wake(START + 3500), settle(START + 4000, 1));
    triggers.push(wake(START + 8000));
    await t.step(START + 10_000, triggers);
    expect(t.calls).toHaveLength(8);
  });

  test("a check that ended before its answer was due is not answered", async () => {
    const t = rig(ACTIONS);
    await t.step(START + 5000, [wake(START + 1000), settle(START + 2000, 5)]);
    expect(t.calls).toEqual([]);
  });
});
