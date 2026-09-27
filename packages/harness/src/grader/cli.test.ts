import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { type CliDeps, main } from "#harness/grader/cli";
import { bunExec } from "#harness/grader/exec";
import type { EvalResult } from "#harness/grader/result";
import { ROUND_1 } from "#harness/grader/scenarios";
import { fakeExec, orcaOk } from "#test-support/fake-exec";

type Captured = CliDeps & { lines: string[]; errors: string[] };

function deps(overrides: Partial<CliDeps> = {}): Captured {
  const lines: string[] = [];
  const errors: string[] = [];
  const base: CliDeps = {
    clock: { now: () => 1_727_384_400_000 },
    cwd: tmpdir(),
    err: (line) => errors.push(line),
    exec: fakeExec(() => orcaOk({ tail: ["hello"] })).exec,
    out: (line) => lines.push(line),
    signal: async () => {},
    sleep: async () => {},
  };
  return { ...base, ...overrides, errors, lines };
}

const graded: EvalResult = {
  checks: [
    { expected: 10, id: "level", met: true, observed: 10, source: "truth" },
  ],
  efficiency: { tokens: {}, toolCalls: 2, turns: 2, wallSec: 72 },
  evidence: {},
  friction: [],
  interventions: [],
  replica: 1,
  round: 1,
  scenario: "t0-self-state",
  sha: "3af5aa3",
  verdict: "pass",
};

describe("grader cli", () => {
  test("prints usage for an unknown command", async () => {
    const d = deps();
    expect(await main(["dance"], d)).toBe(2);
    expect(d.errors[0]).toContain(
      "usage: bun packages/harness/src/grader/cli.ts <command>",
    );
  });

  test("does not treat an Object prototype name as a command", async () => {
    expect(await main(["toString"], deps())).toBe(2);
  });

  test("scenario prints one scenario as JSON", async () => {
    const d = deps();
    expect(await main(["scenario", "t0-self-state"], d)).toBe(0);
    expect(JSON.parse(d.lines[0] ?? "").budget).toEqual({
      minutes: 3,
      tools: 10,
      turns: 4,
    });
  });

  test("scenario without an id lists round 1", async () => {
    const d = deps();
    await main(["scenario"], d);
    expect(d.lines).toEqual([...ROUND_1]);
  });

  test("validate reports schema errors", async () => {
    const dir = await mkdtemp(`${tmpdir()}/cli-`);
    await writeFile(`${dir}/r.json`, "{}");
    const d = deps();
    expect(await main(["validate", `${dir}/r.json`], d)).toBe(1);
    expect(JSON.parse(d.lines[0] ?? "").errors).toContain(
      "$: missing scenario",
    );
  });

  test("result writes result.json and prints the summary line", async () => {
    const dir = await mkdtemp(`${tmpdir()}/cli-`);
    await writeFile(`${dir}/graded.json`, JSON.stringify(graded));
    const d = deps();
    expect(await main(["result", dir, `${dir}/graded.json`], d)).toBe(0);
    expect(d.lines).toEqual(["t0-self-state-1 pass 1/1 tools=2 wall=72"]);
    expect((await Bun.file(`${dir}/result.json`).json()).verdict).toBe("pass");
  });

  test("run refuses a bad round and names an unknown scenario", async () => {
    expect(await main(["run", "t0-self-state", "--round", "x"], deps())).toBe(
      2,
    );
    const d = deps();
    expect(await main(["run", "t9-nope", "--round", "1"], d)).toBe(1);
    expect(d.errors[0]).toStartWith("unknown scenario: t9-nope");
  });

  test("run refuses to start outside the eval worktree root", async () => {
    const d = deps({ cwd: await mkdtemp(`${tmpdir()}/cli-`) });
    expect(await main(["run", "t0-self-state", "--round", "1"], d)).toBe(1);
    expect(d.errors[0]).toBe(
      "run from the eval worktree root (packages/factory/src/main.ts not found)",
    );
  });

  test("leak-check prints file names only", async () => {
    const dir = await mkdtemp(`${tmpdir()}/cli-`);
    await writeFile(
      `${dir}/account.json`,
      JSON.stringify({ password: "pw-secret-123" }),
    );
    await writeFile(`${dir}/frame.txt`, "pw-secret-123");
    const d = deps({ exec: bunExec });
    expect(await main(["leak-check", dir, `${dir}/account.json`], d)).toBe(1);
    expect(d.lines).toEqual(['{"files":["frame.txt"]}']);
  });

  test("launch opens a harness pane for the run dir", async () => {
    const { calls, exec } = fakeExec(() => orcaOk({ handle: "term_launch" }));
    const d = deps({ cwd: "/wt", exec });
    expect(
      await main(
        [
          "launch",
          "/wt/tmp/evals/1/t0-self-state-1",
          "--title",
          "eval-1-t0-self-state-1",
        ],
        d,
      ),
    ).toBe(0);
    expect(d.lines).toEqual(['{"terminal":"term_launch"}']);
    expect(calls[0]?.argv).toContain(
      "exec bun packages/harness/src/entry.ts --profile /wt/tmp/evals/1/t0-self-state-1/account.json --run-dir /wt/tmp/evals/1/t0-self-state-1 --glyphs nerd",
    );
  });

  test("watch runs until the signal and leaves a frame", async () => {
    const dir = await mkdtemp(`${tmpdir()}/cli-`);
    const d = deps();
    expect(await main(["watch", dir, "term_watch"], d)).toBe(0);
    expect(await Bun.file(`${dir}/frames/00000-1727384400000.txt`).text()).toBe(
      "hello",
    );
  });
});
