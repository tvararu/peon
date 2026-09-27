import { describe, expect, test } from "bun:test";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { bunExec, isRecord, parseJsonOutput } from "#harness/grader/exec";
import { fakeExec, ok } from "#test-support/fake-exec";

describe("bunExec", () => {
  test("returns stdout, stderr and the exit code", async () => {
    const result = await bunExec([
      "sh",
      "-c",
      "echo out; echo err >&2; exit 3",
    ]);
    expect(result).toEqual({ code: 3, stderr: "err\n", stdout: "out\n" });
  });

  test("writes stdin to the process", async () => {
    const result = await bunExec(["cat"], { stdin: "hello\n" });
    expect(result.stdout).toBe("hello\n");
  });

  test("runs in the given directory", async () => {
    const result = await bunExec(["pwd", "-P"], { cwd: tmpdir() });
    expect(result.stdout.trim()).toBe(await realpath(tmpdir()));
  });

  test("kills a process that runs past the timeout", async () => {
    const started = Date.now();
    const result = await bunExec(["sleep", "5"], { timeoutMs: 100 });
    expect(result.code).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe("parseJsonOutput", () => {
  test("parses JSON and gives undefined for anything else", () => {
    expect(parseJsonOutput('{"ok":true}\n')).toEqual({ ok: true });
    expect(parseJsonOutput("not json")).toBeUndefined();
    expect(parseJsonOutput("")).toBeUndefined();
  });

  test("isRecord accepts plain objects only", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([1])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });
});

describe("fakeExec", () => {
  test("records argv and stdin and returns the scripted reply", async () => {
    const { calls, exec } = fakeExec((argv) => ok(argv.join(" ")));
    const result = await exec(["rg", "-f", "-"], { stdin: "x\n" });
    expect(result.stdout).toBe("rg -f -");
    expect(calls).toEqual([{ argv: ["rg", "-f", "-"], stdin: "x\n" }]);
  });
});
