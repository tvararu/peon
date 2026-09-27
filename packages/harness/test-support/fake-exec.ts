import type { Exec, ExecResult } from "#harness/grader/exec";

export type ExecCall = { argv: string[]; stdin: string | undefined };
export type FakeExec = { exec: Exec; calls: ExecCall[] };
type Reply = (
  argv: string[],
  stdin: string | undefined,
) => ExecResult | Promise<ExecResult>;

export function fakeExec(reply: Reply): FakeExec {
  const calls: ExecCall[] = [];
  const exec: Exec = async (argv, opts) => {
    calls.push({ argv: [...argv], stdin: opts?.stdin });
    return reply([...argv], opts?.stdin);
  };
  return { calls, exec };
}

export function ok(stdout = ""): ExecResult {
  return { code: 0, stderr: "", stdout };
}

export function failed(code: number, stderr: string, stdout = ""): ExecResult {
  return { code, stderr, stdout };
}

export function orcaOk(terminal: Record<string, unknown>): ExecResult {
  return ok(JSON.stringify({ ok: true, result: { terminal } }));
}
