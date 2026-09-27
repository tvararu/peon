export type ExecResult = { code: number; stdout: string; stderr: string };

export type Exec = (
  argv: readonly string[],
  opts?: { stdin?: string; timeoutMs?: number; cwd?: string },
) => Promise<ExecResult>;

type ExecOptions = NonNullable<Parameters<Exec>[1]>;

async function spawnExec(
  argv: readonly string[],
  opts: ExecOptions = {},
): Promise<ExecResult> {
  const proc = Bun.spawn([...argv], {
    cwd: opts.cwd,
    stderr: "pipe",
    stdin: opts.stdin === undefined ? "ignore" : new Blob([opts.stdin]),
    stdout: "pipe",
    timeout: opts.timeoutMs,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stderr, stdout };
}

export const bunExec: Exec = spawnExec;

export function parseJsonOutput(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
