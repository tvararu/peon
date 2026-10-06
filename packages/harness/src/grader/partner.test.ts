import { describe, expect, test } from "bun:test";
import { scratchDir } from "@peon/core/test-support/scratch";
import type { Exec, ExecResult } from "#harness/grader/exec";
import {
  newPartnerTrack,
  type Partner,
  type PartnerTrack,
  stepPartner,
} from "#harness/grader/partner";
import type { PartnerAction } from "#harness/grader/scenarios";
import { failed } from "#test-support/fake-exec";

const NOW = Date.parse("2026-09-28T02:00:00.000Z");
const NAMES = {
  account: "FAC00000000B0",
  character: "Mage",
  preset: "eversong10-mage",
  wrapper: "/wt/tmp/puppet-FAC00000000B0",
};
const AGENT = { ...NAMES, character: "Fevala", wrapper: "/wt/tmp/puppet-A" };
const PARTNER: Partner = { kind: "partner", names: NAMES, role: "partner1" };
function action(method: string): PartnerAction {
  return {
    argv: ["call", method, '["Fevala"]'],
    at: { kind: "elapsed", ms: 1000 },
    windowMs: 90_000,
  };
}

type Steered = {
  dir: string;
  index: number;
  rows: Record<string, unknown>[];
  timeouts: (number | undefined)[];
};
async function stepWith(
  exec: Exec,
  actions: PartnerAction[],
  track?: PartnerTrack,
  now: number | { at: number } = NOW,
): Promise<Steered> {
  const timeouts: (number | undefined)[] = [];
  const time = typeof now === "number" ? { at: now } : now;
  const seen: Exec = async (argv, opts) => {
    timeouts.push(opts?.timeoutMs);
    return exec(argv, opts);
  };
  const active = track ?? newPartnerTrack(NOW - 100_000);
  const runDir = scratchDir("partner-call");
  await stepPartner({
    actions,
    agent: AGENT,
    clock: { now: () => time.at },
    exec: seen,
    partners: [PARTNER],
    runDir,
    track: active,
    triggers: [],
  });
  const file = Bun.file(`${runDir}/steers.jsonl`);
  const text = ((await file.exists()) ? await file.text() : "").trim();
  const rows: Record<string, unknown>[] =
    text === ""
      ? []
      : (text.split("\n").map((line) => JSON.parse(line)) as Record<
          string,
          unknown
        >[]);
  return { dir: runDir, index: active.cursor.index, rows, timeouts };
}

type Puppet = { after: number; reply: ExecResult };

function puppetExec(puppet: Puppet[]): { clock: { at: number }; exec: Exec } {
  const clock = { at: NOW };
  const exec: Exec = (argv, opts) => {
    if (argv[1] === "read")
      return Promise.resolve({ code: 0, stderr: "", stdout: "[]" });
    const next = puppet.shift() ?? { after: 0, reply: failed(1, "gone") };
    const limit = opts?.timeoutMs ?? Number.POSITIVE_INFINITY;
    const finished = next.after <= limit;
    clock.at += finished ? next.after : limit;
    return Promise.resolve(
      finished ? next.reply : { code: 143, stderr: "", stdout: "" },
    );
  };
  return { clock, exec };
}
const OK: ExecResult = { code: 0, stderr: "", stdout: "" };

async function runCall(
  method: string,
  after: number,
  reply: ExecResult,
): Promise<Steered> {
  const rig = puppetExec([{ after, reply }]);
  const track = newPartnerTrack(NOW - 100_000);
  return stepWith(rig.exec, [action(method)], track, rig.clock);
}

describe("partner calls that wait on the agent", () => {
  test("an answer after 45 s to tradeRequest is not a kill", async () => {
    const result = await runCall("tradeRequest", 45_000, OK);
    expect(result.index).toBe(1);
    expect(result.rows[0]).toMatchObject({ code: 0 });
    expect(result.rows[0]?.["agentSilent"]).toBeUndefined();
  });

  test("tradeAcceptOffered with an offer at 20 s and an accept at 80 s is answered", async () => {
    const result = await runCall("tradeAcceptOffered", 80_000, OK);
    expect(result.rows[0]).toMatchObject({ code: 0 });
    expect(result.rows[0]?.["agentSilent"]).toBeUndefined();
  });

  test("tradeAcceptOffered whose full 120 s wait ran out is silence", async () => {
    const rig = puppetExec([{ after: 200_000, reply: OK }]);
    const track = newPartnerTrack(NOW - 100_000);
    const result = await stepWith(
      rig.exec,
      [action("tradeAcceptOffered")],
      track,
      rig.clock,
    );
    expect(result.index).toBe(1);
    expect(result.rows[0]).toMatchObject({ agentSilent: true, code: 143 });
  });

  test("an unanswered request is a graded row and the run goes on", async () => {
    const result = await runCall(
      "tradeRequest",
      60_000,
      failed(1, "unanswered"),
    );
    expect(result.index).toBe(1);
    expect(result.rows[0]).toMatchObject({
      agentSilent: true,
      code: 1,
      text: 'call tradeRequest ["Fevala"]',
    });
  });

  test("a walk or whisper killed at its timeout still aborts", async () => {
    await expect(runCall("walkToPlayer", 40_000, OK)).rejects.toThrow(
      "partner1 call exited 143",
    );
    const rig = puppetExec([{ after: 40_000, reply: OK }]);
    const whisper: PartnerAction = {
      argv: ["send", "-w", "hi"],
      at: { kind: "elapsed", ms: 1000 },
      windowMs: 90_000,
    };
    await expect(
      stepWith(rig.exec, [whisper], undefined, rig.clock),
    ).rejects.toThrow("partner1 send exited 143");
  });

  test("a walk failure still aborts", async () => {
    await expect(
      runCall("walkToPlayer", 100, failed(1, "no such player")),
    ).rejects.toThrow("partner1 call exited 1");
  });

  test("a tradeRequest that cannot reach the puppet still aborts", async () => {
    await expect(
      runCall("tradeRequest", 100, failed(1, "connect ENOENT sock")),
    ).rejects.toThrow("partner1 call exited 1");
  });

  test("a trade-state failure after a silent agent is a row and the cursor moves", async () => {
    const track = newPartnerTrack(NOW - 100_000);
    const actions = [action("tradeRequest"), action("tradeOffer")];
    const rig = puppetExec([
      { after: 60_000, reply: failed(1, "unanswered") },
      { after: 100, reply: failed(1, "no trade is open") },
    ]);
    const first = await stepWith(rig.exec, actions, track, rig.clock);
    expect(first.rows).toHaveLength(1);
    expect(first.index).toBe(1);
    rig.clock.at = track.cursor.since + 1000;
    const second = await stepWith(rig.exec, actions, track, rig.clock);
    expect(second.rows).toHaveLength(1);
    expect(second.rows[0]).toMatchObject({
      code: 1,
      text: 'call tradeOffer ["Fevala"]',
    });
    expect(second.index).toBe(2);
  });

  test("a puppet crash after a silent agent still aborts", async () => {
    const track = newPartnerTrack(NOW - 100_000);
    const actions = [action("tradeRequest"), action("tradeOffer")];
    const rig = puppetExec([
      { after: 60_000, reply: failed(1, "unanswered") },
      {
        after: 100,
        reply: failed(1, "No puppet is running for this account."),
      },
    ]);
    await stepWith(rig.exec, actions, track, rig.clock);
    rig.clock.at += 1000;
    await expect(stepWith(rig.exec, actions, track, rig.clock)).rejects.toThrow(
      "partner1 call exited 1",
    );
    expect(track.cursor.index).toBe(1);
  });

  test("silence of one partner does not excuse another partner's failure", async () => {
    const track = newPartnerTrack(NOW - 100_000);
    const second: PartnerAction = { ...action("tradeOffer"), actor: 2 };
    const other: Partner = { kind: "partner", names: NAMES, role: "partner2" };
    const actions = [action("tradeRequest"), second];
    const rig = puppetExec([
      { after: 60_000, reply: failed(1, "unanswered") },
      { after: 100, reply: failed(1, "no trade is open") },
    ]);
    const init = {
      actions,
      agent: AGENT,
      clock: { now: () => rig.clock.at },
      exec: rig.exec,
      partners: [PARTNER, other],
      track,
      triggers: [],
    };
    const runDir = scratchDir("partner-two");
    await stepPartner({ ...init, runDir });
    rig.clock.at += 1000;
    await expect(stepPartner({ ...init, runDir })).rejects.toThrow(
      "partner2 call exited 1",
    );
  });
});
