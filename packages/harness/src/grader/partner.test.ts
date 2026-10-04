import { describe, expect, test } from "bun:test";
import { scratchDir } from "@peon/core/test-support/scratch";
import type { Exec } from "#harness/grader/exec";
import {
  actionTimeoutMs,
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
  index: number;
  rows: Record<string, unknown>[];
  timeouts: (number | undefined)[];
};

async function stepWith(
  exec: Exec,
  actions: PartnerAction[],
  track?: PartnerTrack,
): Promise<Steered> {
  const timeouts: (number | undefined)[] = [];
  const seen: Exec = async (argv, opts) => {
    timeouts.push(opts?.timeoutMs);
    return exec(argv, opts);
  };
  const active = track ?? newPartnerTrack(NOW - 100_000);
  const runDir = scratchDir("partner-call");
  await stepPartner({
    actions,
    agent: AGENT,
    clock: { now: () => NOW },
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
  return { index: active.cursor.index, rows, timeouts };
}

describe("partner calls that wait on the agent", () => {
  test("tradeRequest covers the puppet's trade wait and a walk keeps the default", () => {
    expect(actionTimeoutMs(["call", "tradeRequest", "[]"])).toBeGreaterThan(
      60_000,
    );
    expect(
      actionTimeoutMs(["call", "tradeRequestQuiet", "[]"]),
    ).toBeGreaterThan(60_000);
    expect(actionTimeoutMs(["call", "tradeAnswer", "[]"])).toBeGreaterThan(
      60_000,
    );
    expect(actionTimeoutMs(["call", "tradeAcceptOffered"])).toBeGreaterThan(
      60_000,
    );
    expect(actionTimeoutMs(["call", "walkToPlayer", "[]"])).toBeLessThanOrEqual(
      30_000,
    );
    expect(actionTimeoutMs(["send", "-w", "hi"])).toBeLessThanOrEqual(30_000);
  });

  test("an unanswered request is a graded row and the run goes on", async () => {
    const exec: Exec = async () => failed(1, "unanswered");
    const track = newPartnerTrack(NOW - 100_000);
    const both = await stepWith(exec, [action("tradeRequest")], track);
    expect(both.index).toBe(1);
    expect(both.rows[0]).toMatchObject({
      agentSilent: true,
      code: 1,
      text: 'call tradeRequest ["Fevala"]',
    });
  });

  test("a killed call is a graded row", async () => {
    const exec: Exec = async () => ({ code: 143, stderr: "", stdout: "" });
    const both = await stepWith(exec, [action("tradeRequest")]);
    expect(both.index).toBe(1);
    expect(both.rows[0]).toMatchObject({ agentSilent: true, code: 143 });
  });

  test("a later trade call after a silent agent is a row, not an abort", async () => {
    const replies = [failed(1, "unanswered"), failed(1, "no trade open")];
    const exec: Exec = async () => replies.shift() ?? failed(1, "gone");
    const track = newPartnerTrack(NOW - 100_000);
    const actions = [action("tradeRequest"), action("tradeOffer")];
    const first = actions.slice(0, 1);
    const rest = actions.slice(1);
    await stepWith(exec, first, track);
    const second = await stepWith(exec, rest, track);
    expect(track.cursor.index).toBe(1);
    expect(second.rows).toHaveLength(0);
  });

  test("a walk failure still aborts", async () => {
    const exec: Exec = async () => failed(1, "no such player");
    await expect(stepWith(exec, [action("walkToPlayer")])).rejects.toThrow(
      "partner1 call exited 1",
    );
  });

  test("a tradeRequest that cannot reach the puppet still aborts", async () => {
    const exec: Exec = async () => failed(1, "connect ENOENT sock");
    await expect(stepWith(exec, [action("tradeRequest")])).rejects.toThrow(
      "partner1 call exited 1",
    );
  });
});
