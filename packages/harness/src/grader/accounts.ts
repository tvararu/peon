import { appendFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { type Exec, isRecord, parseJsonOutput } from "#harness/grader/exec";
import type { AbortCause } from "#harness/grader/result";
import type { Scenario } from "#harness/grader/scenarios";

export const SOAP = ["bun", "packages/factory/src/main.ts", "soap"] as const;

export type Role = "agent" | "partner";
export type AccountNames = {
  account: string;
  character: string;
  wrapper: string;
  preset: string;
};

export const FILES = {
  agent: { names: "names.json", session: "account.json" },
  partner: { names: "partner-names.json", session: "partner.json" },
} as const;

const FACTORY_ACCOUNT = /^FAC[0-9A-F]{10}$/;
const CREATE_TIMEOUT_MS = 120_000;
const SOAP_TIMEOUT_MS = 60_000;

export class RunAbort extends Error {
  readonly abortCause: AbortCause;
  readonly evidence: string;

  constructor(
    abortCause: AbortCause,
    evidence: string,
    options?: ErrorOptions,
  ) {
    super(`${abortCause}: ${evidence}`, options);
    this.abortCause = abortCause;
    this.evidence = evidence;
  }
}

export function sessionFile(runDir: string, role: Role): string {
  return `${runDir}/${FILES[role].session}`;
}

function lastLine(text: string): string {
  return text.trim().split("\n").at(-1) ?? "";
}

function namesOf(json: unknown): AccountNames {
  const reply = isRecord(json) ? json : {};
  const account = reply["account"];
  const character = reply["character"];
  const preset = reply["preset"];
  const wrapper = reply["wrapper"];
  if (typeof account !== "string" || !FACTORY_ACCOUNT.test(account))
    throw new RunAbort(
      "soap_create",
      "soap create returned no factory account",
    );
  if (
    typeof character !== "string" ||
    typeof preset !== "string" ||
    typeof wrapper !== "string"
  ) {
    throw new RunAbort(
      "soap_create",
      "soap create reply lacks character, preset or wrapper",
    );
  }
  return { account, character, preset, wrapper };
}

type CreateInit = {
  exec: Exec;
  runDir: string;
  preset: string;
  owner: string;
  role: Role;
};

export async function createAccount({
  exec,
  runDir,
  preset,
  owner,
  role,
}: CreateInit): Promise<AccountNames> {
  const { code, stderr, stdout } = await exec(
    [...SOAP, "create", preset, "--owner", owner],
    { timeoutMs: CREATE_TIMEOUT_MS },
  );
  if (code !== 0)
    throw new RunAbort(
      "soap_create",
      `soap create ${preset} exited ${code}: ${lastLine(stderr)}`,
    );
  await writeFile(sessionFile(runDir, role), stdout, { mode: 0o600 });
  const names = namesOf(parseJsonOutput(stdout));
  await writeFile(
    `${runDir}/${FILES[role].names}`,
    `${JSON.stringify(names, null, 2)}\n`,
  );
  return names;
}

type SetupInit = {
  exec: Exec;
  runDir: string;
  account: string;
  setup: Scenario["setup"];
};

export async function applySetup({
  exec,
  runDir,
  account,
  setup,
}: SetupInit): Promise<void> {
  for (const { endpoint, body } of setup) {
    const { stdout } = await exec(
      [...SOAP, "setup", account, endpoint, JSON.stringify(body)],
      { timeoutMs: SOAP_TIMEOUT_MS },
    );
    const reply = parseJsonOutput(stdout);
    await appendFile(
      `${runDir}/setup.log`,
      `${reply === undefined ? stdout.trim() : JSON.stringify(reply)}\n`,
    );
    if (!isRecord(reply) || reply["ok"] !== true) {
      const reason = isRecord(reply)
        ? String(reply["reason"] ?? "no reason")
        : "no reply";
      throw new RunAbort("setup_failed", `${endpoint}: ${reason}`);
    }
  }
}

function listedAccounts(rows: unknown[]): Set<string> {
  return new Set(
    rows.flatMap((row) =>
      isRecord(row) && typeof row["account"] === "string"
        ? [row["account"]]
        : [],
    ),
  );
}

export async function deleteAccounts({
  exec,
  accounts,
}: {
  exec: Exec;
  accounts: readonly string[];
}): Promise<string[]> {
  for (const account of accounts)
    await exec([...SOAP, "delete", account], { timeoutMs: SOAP_TIMEOUT_MS });
  const { code, stderr, stdout } = await exec([...SOAP, "list"], {
    timeoutMs: SOAP_TIMEOUT_MS,
  });
  const rows = parseJsonOutput(stdout);
  if (code !== 0 || !Array.isArray(rows))
    throw new Error(`soap list exited ${code}: ${lastLine(stderr)}`);
  const listed = listedAccounts(rows);
  return accounts.filter((account) => listed.has(account));
}

export async function quarantine({
  runDir,
  files,
}: {
  runDir: string;
  files: readonly string[];
}): Promise<void> {
  if (files.length === 0) return;
  await mkdir(`${runDir}/quarantine`, { mode: 0o700, recursive: true });
  for (const file of files)
    await rename(
      `${runDir}/${file}`,
      `${runDir}/quarantine/${file.replaceAll("/", "_")}`,
    );
}

export function sessionFiles(runDir: string): string[] {
  return (Object.keys(FILES) as Role[]).map((role) =>
    sessionFile(runDir, role),
  );
}

export async function removeSessionFiles(runDir: string): Promise<void> {
  for (const file of sessionFiles(runDir)) await rm(file, { force: true });
}
