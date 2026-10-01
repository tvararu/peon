import { appendFileSync, mkdirSync } from "node:fs";
import {
  appendFile,
  chmod,
  mkdir,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import {
  type Config,
  parseConfig,
  realmDefaults,
  serializeConfig,
} from "@peon/core/lib/config";
import { factoryConfigDir, factoryStateDir } from "#factory/config";
import { factoryAccount } from "#factory/factory-account";
import { requirePatchedLibrary } from "#factory/namigator-library";
import {
  copyConfirmed,
  type Names,
  pinfoAccount,
  type SoapResult,
} from "#factory/soap-copy";
import { createWired } from "#factory/soap-create";
import {
  needsProtocol,
  type Preset,
  presetLanguage,
  presetSpecs,
  presets,
  templateFor,
} from "#factory/soap-presets";
import {
  accountFiles,
  removeAccountFiles,
  writeWrapper,
  xdgEnv,
} from "#factory/soap-wrapper";

export type Ledger = Names & {
  password: string;
  preset: Preset;
  createdAt: string;
  owner: string;
  root?: string;
};
export type CreateOptions = {
  preset: Preset;
  owner?: string;
  gm?: number;
  traceCreateDir?: string;
};
export type Session = Names & {
  preset: Preset;
  password: string;
  dir: string;
  wrapper: string;
};

export type ConsoleDeps = {
  cwd: string;
  load: (account: string) => Promise<Ledger | undefined>;
  log: (line: string) => Promise<void>;
  now: () => Date;
  run: (command: string) => Promise<SoapResult>;
};

const lockStaleMs = 30_000;
const lockPollMs = 100;
const lockTries = 400;
const pinfoTries = 100;
const pinfoPollMs = 50;
const copiedFields = ["spell_data_dir", "navigation_data_dir"] as const;
type Inherited = Pick<
  Config,
  (typeof copiedFields)[number] | "host" | "navigation_library" | "port"
>;
const envLine = /^([A-Z0-9_]+)=(.*)$/;
const quoted = /^(["'])(.*)\1$/;
const resultTag = /<result>([\s\S]*?)<\/result>/;
const faultTag = /<faultstring>([\s\S]*?)<\/faultstring>/;
const tripleLetter = /(.)\1\1/i;
const accountMissing = /Account not exist/i;
const accountTaken = /already exist/i;
const createTries = 8;
const lowerLetters = String.fromCharCode(
  ...Array.from({ length: 26 }, (_, i) => 97 + i),
);
const passwordAlphabet = `${lowerLetters.toUpperCase()}${lowerLetters}0123456789`;

export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = line.trim().match(envLine);
    if (match?.[1]) env[match[1]] = (match[2] ?? "").replace(quoted, "$2");
  }
  return env;
}

async function soapEnv(): Promise<Record<string, string>> {
  return parseEnv(await Bun.file(`${factoryConfigDir()}/soap.env`).text());
}

function required(env: Record<string, string>, key: string): string {
  const value = env[key];
  if (!value)
    throw new Error(`${key} missing from ${factoryConfigDir()}/soap.env`);
  return value;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeXml(text: string): string {
  return text
    .replace(/&#xD;/gi, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function envelope(command: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="urn:AC"><SOAP-ENV:Body><ns1:executeCommand><command>${escapeXml(command)}</command></ns1:executeCommand></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
}

export function parseResponse(xml: string): SoapResult {
  const result = xml.match(resultTag);
  if (result) return { ok: true, text: unescapeXml(result[1] ?? "").trim() };
  const fault = xml.match(faultTag);
  if (fault) return { ok: false, text: unescapeXml(fault[1] ?? "").trim() };
  return { ok: false, text: xml.trim() || "empty SOAP response" };
}

async function tryLock(dir: string): Promise<boolean> {
  try {
    await mkdir(dir);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
}

async function clearStaleLock(dir: string): Promise<void> {
  const info = await stat(dir).catch(() => undefined);
  if (info && Date.now() - info.mtimeMs > lockStaleMs)
    await rm(dir, { force: true, recursive: true });
}

async function acquireLock(dir: string): Promise<void> {
  await mkdir(factoryStateDir(), { recursive: true });
  for (let i = 0; i < lockTries; i++) {
    if (await tryLock(dir)) return;
    await clearStaleLock(dir);
    await Bun.sleep(lockPollMs);
  }
  throw new Error(`SOAP lock busy: ${dir}`);
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const dir = `${factoryStateDir()}/soap.lock`;
  await acquireLock(dir);
  try {
    return await fn();
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

async function post(command: string): Promise<SoapResult> {
  const env = await soapEnv();
  const user = required(env, "PEON_SOAP_USER");
  const auth = btoa(`${user}:${required(env, "PEON_SOAP_PASSWORD")}`);
  const headers = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "text/xml",
  };
  const init = {
    body: envelope(command),
    headers,
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  };
  const res = await fetch(required(env, "PEON_SOAP_URL"), init);
  return parseResponse(await res.text());
}

function soap(command: string): Promise<SoapResult> {
  return withLock(() => post(command));
}

export function accountName(seconds: number, random: string): string {
  return `FAC${seconds.toString(16).padStart(8, "0")}${random}`.toUpperCase();
}

export function characterName(account: string): string {
  const digits = account.slice(3).toLowerCase();
  let name = "F";
  for (const digit of digits) {
    const letter = String.fromCharCode(97 + Number.parseInt(digit, 16));
    const tail = name.slice(-2).toLowerCase();
    name +=
      tail.length === 2 && tail[0] === tail[1] && tail[1] === letter
        ? "z"
        : letter;
  }
  return name;
}

export function hasTriple(name: string): boolean {
  return tripleLetter.test(name);
}

function randomByte(): string {
  const [byte = 0] = crypto.getRandomValues(new Uint8Array(1));
  return byte.toString(16).padStart(2, "0");
}

export function newNames(now = Date.now(), random = randomByte): Names {
  const seconds = Math.floor(now / 1000);
  const account = accountName(seconds, random());
  return { account, character: characterName(account) };
}

export function newPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(
    bytes,
    (b) => passwordAlphabet[b % passwordAlphabet.length],
  ).join("");
}

export function assertFactory(account: string): void {
  if (!factoryAccount.test(account))
    throw new Error(`refusing non-factory account: ${account}`);
}

export function accountAgeHours(account: string, now = Date.now()): number {
  assertFactory(account);
  const seconds = Number.parseInt(account.slice(3, 11), 16);
  return (now / 1000 - seconds) / 3600;
}

function ledgerDir(): string {
  return `${factoryStateDir()}/accounts`;
}

function ledgerPath(account: string): string {
  return `${ledgerDir()}/${account}.json`;
}

async function saveLedger(entry: Ledger): Promise<void> {
  await mkdir(ledgerDir(), { mode: 0o700, recursive: true });
  await writeFile(
    ledgerPath(entry.account),
    `${JSON.stringify(entry, null, 2)}\n`,
    { mode: 0o600 },
  );
}

async function loadLedger(account: string): Promise<Ledger | undefined> {
  const file = Bun.file(ledgerPath(account));
  return (await file.exists()) ? ((await file.json()) as Ledger) : undefined;
}

export async function list(): Promise<Ledger[]> {
  const names = await readdir(ledgerDir()).catch(() => [] as string[]);
  const accounts = names
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.slice(0, -5));
  const entries = await Promise.all(
    accounts.filter((a) => factoryAccount.test(a)).map(loadLedger),
  );
  return entries.filter((e): e is Ledger => e !== undefined);
}

async function must(command: string): Promise<string> {
  const res = await soap(command);
  if (!res.ok)
    throw new Error(`${command.split(" ").slice(0, 2).join(" ")}: ${res.text}`);
  return res.text;
}

async function presetTemplate(preset: Preset): Promise<string> {
  if (!presets.includes(preset))
    throw new Error(`unknown preset: ${preset} (${presets.join("|")})`);
  return templateFor(preset, await soapEnv());
}

export async function inheritedConfig(
  configPath = `${homedir()}/.config/peon/config.toml`,
  library: () => Promise<string> = requirePatchedLibrary,
): Promise<Inherited> {
  const inherited: Inherited = {
    ...realmDefaults,
    navigation_library: await library(),
  };
  const file = Bun.file(configPath);
  if (!(await file.exists())) return inherited;
  const base = parseConfig(await file.text());
  inherited.host = base.host;
  inherited.port = base.port;
  for (const key of copiedFields) if (base[key]) inherited[key] = base[key];
  return inherited;
}

async function writeSession(
  entry: Ledger & { root: string },
  inherited: Inherited,
): Promise<Session> {
  const { account, password, character, preset, root } = entry;
  const { dir } = accountFiles(root, account);
  const env = xdgEnv(dir);
  const config: Config = {
    account,
    character,
    language: presetLanguage(preset),
    password,
    timeout_minutes: 30,
    ...inherited,
  };
  await mkdir(`${env.XDG_CONFIG_HOME}/peon`, {
    mode: 0o700,
    recursive: true,
  });
  await mkdir(env.XDG_RUNTIME_DIR, { mode: 0o700, recursive: true });
  await chmod(env.XDG_RUNTIME_DIR, 0o700);
  await mkdir(env.XDG_STATE_HOME, { recursive: true });
  await writeFile(
    `${env.XDG_CONFIG_HOME}/peon/config.toml`,
    `${serializeConfig(config)}\n`,
    { mode: 0o600 },
  );
  const wrapper = await writeWrapper({ account, character, root });
  return { account, character, dir, password, preset, wrapper };
}

export async function reserveNames(
  password: string,
  run: (command: string) => Promise<SoapResult> = soap,
  fresh: () => Names = newNames,
): Promise<Names> {
  let text = "";
  for (let i = 0; i < createTries; i++) {
    const names = fresh();
    const res = await run(`account create ${names.account} ${password}`);
    if (res.ok) return names;
    text = res.text;
    if (!accountTaken.test(text)) break;
  }
  throw new Error(`account create: ${text}`);
}
function traceSink(dir: string) {
  return {
    bodies: true,
    row: (row: { opcode: number }) => {
      mkdirSync(dir, { mode: 0o700, recursive: true });
      appendFileSync(`${dir}/packets.jsonl`, `${JSON.stringify({ ...row })}\n`);
    },
  };
}

export async function createAccount({
  preset,
  gm,
  owner,
  traceCreateDir,
}: CreateOptions): Promise<Session> {
  const inherited = await inheritedConfig();
  const password = newPassword();
  const names = await reserveNames(password);
  const root = process.cwd();
  const entry = {
    ...names,
    createdAt: new Date().toISOString(),
    owner: owner ?? root,
    password,
    preset,
    root,
  };
  try {
    await saveLedger(entry);
    if (needsProtocol(presetSpecs[preset])) {
      const file = Bun.file(`${factoryConfigDir()}/soap.env`);
      const env = (await file.exists()) ? parseEnv(await file.text()) : {};
      await createWired(preset, {
        console: (accounts, command) => consoleCommand(accounts, command),
        createTrace: traceCreateDir
          ? () => traceSink(traceCreateDir)
          : undefined,
        env,
        host: inherited.host,
        loadEntry: loadLedger,
        names,
        password,
        port: inherited.port,
        run: soap,
      });
    } else {
      const template = await presetTemplate(preset);
      await copyConfirmed(soap, template, names);
    }
    if (gm) await must(`account set gmlevel ${entry.account} ${gm} -1`);
    return await writeSession(entry, inherited);
  } catch (err) {
    await deleteAccount(entry.account).catch((e) =>
      console.error(`cleanup of ${entry.account} failed: ${e}`),
    );
    throw err;
  }
}

async function isGone(account: string, character?: string): Promise<boolean> {
  const again = await soap(`account delete ${account}`);
  if (again.ok || !accountMissing.test(again.text)) return false;
  return (
    !character ||
    pinfoAccount((await soap(`pinfo ${character}`)).text) !== account
  );
}

async function verifyDeleted(
  account: string,
  character?: string,
): Promise<void> {
  for (let i = 0; i < pinfoTries; i++) {
    if (await isGone(account, character)) return;
    await Bun.sleep(pinfoPollMs);
  }
  throw new Error(`${account} still exists after account delete`);
}

export async function deleteAccount(account: string): Promise<void> {
  assertFactory(account);
  const entry = await loadLedger(account);
  const res = await soap(`account delete ${account}`);
  if (!(res.ok || accountMissing.test(res.text)))
    throw new Error(`account delete ${account}: ${res.text}`);
  await verifyDeleted(account, entry?.character);
  if (entry?.root) await removeAccountFiles(entry.root, account);
  await rm(ledgerPath(account), { force: true });
}

export async function expired(
  hours: number,
  now = Date.now(),
): Promise<Ledger[]> {
  return (await list()).filter((e) => accountAgeHours(e.account, now) >= hours);
}

export async function sweep(hours: number): Promise<string[]> {
  const deleted: string[] = [];
  for (const { account } of await expired(hours)) {
    await deleteAccount(account).then(
      () => deleted.push(account),
      (err) =>
        console.error(
          `sweep ${account}: ${err instanceof Error ? err.message : err}`,
        ),
    );
  }
  return deleted;
}

function gmLogPath(): string {
  return `${factoryStateDir()}/gm.log`;
}

async function appendGmLog(line: string): Promise<void> {
  await mkdir(factoryStateDir(), { recursive: true });
  await appendFile(gmLogPath(), line, { mode: 0o600 });
}

async function assertOwned(
  account: string,
  { cwd, load }: ConsoleDeps,
): Promise<void> {
  assertFactory(account);
  const entry = await load(account);
  if (!entry) throw new Error(`no ledger entry for ${account}`);
  if (entry.root !== cwd)
    throw new Error(`${account} was not created in this worktree (${cwd})`);
  if (entry.character !== characterName(account))
    throw new Error(`${account} ledger names another character`);
}

export async function consoleCommand(
  accounts: string[],
  command: string,
  overrides: Partial<ConsoleDeps> = {},
): Promise<SoapResult> {
  const deps: ConsoleDeps = {
    cwd: process.cwd(),
    load: loadLedger,
    log: appendGmLog,
    now: () => new Date(),
    run: soap,
    ...overrides,
  };
  if (accounts.length === 0)
    throw new Error("console command needs an account");
  for (const account of accounts) await assertOwned(account, deps);
  const record = async ({ ok, text }: SoapResult) => {
    const at = deps.now().toISOString();
    const line = { accounts, at, command, ok, root: deps.cwd, text };
    await deps.log(`${JSON.stringify(line)}\n`);
  };
  const res = await deps.run(command).catch(async (error: unknown) => {
    await record({ ok: false, text: String(error) });
    throw error;
  });
  await record(res);
  return res;
}
