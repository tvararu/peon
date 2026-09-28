import { appendFile } from "node:fs/promises";
import { SOAP } from "#harness/grader/accounts";
import { type Exec, isRecord, parseJsonOutput } from "#harness/grader/exec";
import type { Partner } from "#harness/grader/partner";
import type {
  ConsoleRead,
  ScenarioCheck,
  TruthWho,
} from "#harness/grader/scenarios";

export const CONSOLE_FILE = "console.jsonl";

const READ_TIMEOUT_MS = 30_000;

export type ConsoleRow = {
  id: string;
  who: TruthWho;
  account: string;
  verb: ConsoleRead["read"];
  arg?: string;
  code: number;
  text: string;
};

type ReadInit = {
  exec: Exec;
  runDir: string;
  checks: readonly ScenarioCheck[];
  agent: string | undefined;
  partners: readonly Pick<Partner, "names" | "role">[];
};

export const consoleArgv = (account: string, read: ConsoleRead): string[] => [
  ...SOAP,
  "gm",
  account,
  "read",
  read.read,
  ...(read.arg === undefined ? [] : [read.arg]),
];

function textOf(stdout: string, stderr: string): string {
  const reply = parseJsonOutput(stdout.trim());
  if (!isRecord(reply)) return stderr.trim();
  const { text } = reply;
  return typeof text === "string" ? text : stderr.trim();
}

function accountOf(
  { agent, partners }: ReadInit,
  who: TruthWho,
): string | undefined {
  if (who === "agent") return agent;
  return partners.find(({ role }) => role === who)?.names.account;
}

export async function readConsole(init: ReadInit): Promise<ConsoleRow[]> {
  const rows: ConsoleRow[] = [];
  for (const { evidence, id, source } of init.checks) {
    const read = evidence?.console;
    if (source !== "console" || read === undefined) continue;
    const who = evidence?.who ?? "agent";
    const account = accountOf(init, who);
    if (account === undefined) continue;
    const { code, stderr, stdout } = await init.exec(
      consoleArgv(account, read),
      { timeoutMs: READ_TIMEOUT_MS },
    );
    const row: ConsoleRow = {
      account,
      ...(read.arg === undefined ? {} : { arg: read.arg }),
      code,
      id,
      text: textOf(stdout, stderr),
      verb: read.read,
      who,
    };
    rows.push(row);
    await appendFile(
      `${init.runDir}/${CONSOLE_FILE}`,
      `${JSON.stringify(row)}\n`,
    );
  }
  return rows;
}
