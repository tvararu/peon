import { type Exec, isRecord, parseJsonOutput } from "#harness/grader/exec";

export const HARNESS_LAUNCH = "bun packages/harness/src/entry.ts";
export const QUIT_CONFIRM_MS = 3000;

const ESC = "\u001b";
const CTRL_C = "\u0003";
const CTRL_D = "\u0004";
const ORCA_TIMEOUT_MS = 30_000;
const SAFE_WORD = /^[\w./:@%+=,-]+$/;

export type Pane = {
  id: string;
  send: (text: string, opts?: { enter?: boolean }) => Promise<void>;
  screen: () => Promise<string>;
  escape: () => Promise<void>;
  quit: () => Promise<void>;
  waitExit: (timeoutMs: number) => Promise<boolean>;
  close: () => Promise<void>;
};

type Reply = {
  code: number;
  json: Record<string, unknown> | undefined;
  text: string;
};

export function shellQuote(word: string): string {
  return SAFE_WORD.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
}

export function harnessCommand({
  profile,
  runDir,
}: {
  profile: string;
  runDir: string;
}): string {
  return `exec ${HARNESS_LAUNCH} --profile ${shellQuote(profile)} --run-dir ${shellQuote(runDir)} --glyphs nerd`;
}

async function orca(
  exec: Exec,
  args: readonly string[],
  timeoutMs = ORCA_TIMEOUT_MS,
): Promise<Reply> {
  const { code, stderr, stdout } = await exec(
    ["orca-ide", "terminal", ...args, "--json"],
    { timeoutMs },
  );
  const json = parseJsonOutput(stdout);
  return {
    code,
    json: isRecord(json) ? json : undefined,
    text: (stderr || stdout).trim(),
  };
}

function succeeded(reply: Reply): boolean {
  return reply.code === 0 && reply.json?.["ok"] === true;
}

function errorCode(reply: Reply): unknown {
  const error = reply.json?.["error"];
  return isRecord(error) ? error["code"] : undefined;
}

async function terminal(
  exec: Exec,
  args: readonly string[],
): Promise<Record<string, unknown>> {
  const reply = await orca(exec, args);
  if (!succeeded(reply))
    throw new Error(
      `orca-ide terminal ${args[0]} failed (${reply.code}): ${reply.text}`,
    );
  const result = reply.json?.["result"];
  const term = isRecord(result) ? result["terminal"] : undefined;
  return isRecord(term) ? term : {};
}

type OpenInit = {
  exec: Exec;
  worktree: string;
  title: string;
  command: string;
};

export async function openPane({
  exec,
  worktree,
  title,
  command,
}: OpenInit): Promise<Pane> {
  const args = [
    "create",
    "--worktree",
    `path:${worktree}`,
    "--title",
    title,
    "--command",
    command,
  ];
  const term = await terminal(exec, args);
  const handle = term["handle"];
  if (typeof handle !== "string")
    throw new Error("orca-ide terminal create returned no handle");
  return attachPane({ exec, id: handle });
}

export function attachPane({ exec, id }: { exec: Exec; id: string }): Pane {
  const send = async (
    text: string,
    opts: { enter?: boolean } = {},
  ): Promise<void> => {
    await terminal(exec, [
      "send",
      "--terminal",
      id,
      "--text",
      text,
      ...(opts.enter ? ["--enter"] : []),
    ]);
  };
  const waitExit = async (timeoutMs: number): Promise<boolean> => {
    const args = [
      "wait",
      "--terminal",
      id,
      "--for",
      "exit",
      "--timeout-ms",
      String(timeoutMs),
    ];
    return succeeded(await orca(exec, args, timeoutMs + 5000));
  };
  const showsPi = async (): Promise<boolean> => {
    const reply = await orca(exec, ["read", "--terminal", id, "--screen"]);
    const result = reply.json?.["result"];
    const term = isRecord(result) ? result["terminal"] : undefined;
    if (!(succeeded(reply) && isRecord(term)) || term["status"] === "exited")
      return false;
    const tail = term["tail"];
    return Array.isArray(tail) && tail.length > 0;
  };
  const quit = async (): Promise<void> => {
    await send(CTRL_D);
    if (await waitExit(QUIT_CONFIRM_MS)) return;
    if (!(await showsPi())) return;
    await Promise.all([send(CTRL_C), send(CTRL_C)]);
  };
  const screen = async (): Promise<string> => {
    const tail = (await terminal(exec, ["read", "--terminal", id, "--screen"]))[
      "tail"
    ];
    return Array.isArray(tail) ? tail.join("\n") : "";
  };
  const close = async (): Promise<void> => {
    const reply = await orca(exec, ["close", "--terminal", id, "--tab"]);
    if (succeeded(reply) || errorCode(reply) === "terminal_handle_stale")
      return;
    throw new Error(
      `orca-ide terminal close failed (${reply.code}): ${reply.text}`,
    );
  };
  return { close, escape: () => send(ESC), id, quit, screen, send, waitExit };
}
