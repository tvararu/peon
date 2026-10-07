import { appendFile } from "node:fs/promises";
import { SOAP } from "#harness/grader/accounts";
import { type Exec, isRecord, parseJsonOutput } from "#harness/grader/exec";

export const CONSOLE_WAIT_FILE = "console-wait.jsonl";
export const CONSOLE_WAIT_POLL_MS = 60_000;

export type ConsoleWait = {
  read: string;
  arg?: string;
  match: string;
  timeoutMinutes: number;
};

export type ConsoleWaitInit = {
  exec: Exec;
  runDir: string;
  account: string;
  wait: ConsoleWait;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
};

export function consoleWaitArgv(account: string, wait: ConsoleWait): string[] {
  return [
    ...SOAP,
    "gm",
    account,
    "read",
    wait.read,
    ...(wait.arg === undefined ? [] : [wait.arg]),
  ];
}

function readText(stdout: string, stderr: string): string {
  const reply = parseJsonOutput(stdout.trim());
  if (!isRecord(reply)) return stderr.trim();
  const { text } = reply;
  return typeof text === "string" ? text : stderr.trim();
}

export async function waitConsoleRead(init: ConsoleWaitInit): Promise<string> {
  const { account, exec, log, runDir, wait } = init;
  const sleep = init.sleep ?? Bun.sleep;
  let pattern: RegExp;
  try {
    pattern = new RegExp(wait.match, "m");
  } catch (error) {
    throw new Error(`console wait: invalid regex ${wait.match}`, {
      cause: error,
    });
  }
  const deadline = Date.now() + wait.timeoutMinutes * 60_000;
  for (;;) {
    const { code, stderr, stdout } = await exec(
      consoleWaitArgv(account, wait),
      {
        timeoutMs: 30_000,
      },
    );
    const text = readText(stdout, stderr);
    if (code === 0 && pattern.test(text)) {
      await appendFile(
        `${runDir}/${CONSOLE_WAIT_FILE}`,
        `${JSON.stringify({ matched: true, text })}\n`,
      );
      return text;
    }
    log?.(`console wait ${wait.read}: no match yet`);
    if (Date.now() >= deadline)
      throw new Error(
        `console wait: read ${wait.read} did not match within ${wait.timeoutMinutes} minutes`,
      );
    await sleep(CONSOLE_WAIT_POLL_MS);
  }
}
