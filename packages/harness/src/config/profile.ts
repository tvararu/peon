import { homedir } from "node:os";
import type { ClientConfig, NavigationSource } from "@peon/core";
import { type Config, parseConfig } from "@peon/core/lib/config";
import { messageOf } from "@peon/core/lib/errors";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { Profile, ProfileSource } from "#harness/contract/config";
import { jevPort } from "#harness/jev/port";
import { navigationSource } from "#harness/navigation/maps";
import { dbcDirectory } from "#harness/runtime/dbc-directory";

export type ProfileErrorCode =
  | "unreadable"
  | "unknown_format"
  | "missing_field"
  | "protected_account"
  | "protected_character";

export class ProfileError extends Error {
  readonly code: ProfileErrorCode;

  constructor(code: ProfileErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProfileError";
    this.code = code;
  }
}

export const PROTECTED_ACCOUNTS: readonly string[] = [
  "ADMIN",
  "DEITY",
  "X",
  "Y",
  "AUCTIONHOUSE",
  "TCFACTORY",
  "TCPRESETS",
];
export const PROTECTED_ACCOUNT_PREFIXES: readonly string[] = ["RNDBOT"];
export const PROTECTED_CHARACTERS: readonly string[] = ["Xiara"];

type Json = Record<string, unknown>;
type Parsed = { source: ProfileSource; config: Config };
type NavFields = Pick<
  Config,
  "spell_data_dir" | "navigation_data_dir" | "navigation_library"
>;

const ALLIANCE_PRESETS: readonly string[] = ["elwynn1", "elwynn10"];

export function isProtected(account: string, character: string): boolean {
  return protectedAccount(account) || protectedCharacter(character);
}

export async function loadProfile(
  path: string,
  home = homedir(),
): Promise<Profile> {
  const { source, config } = await parseProfile({
    home,
    path,
    text: await readText(path),
  });
  if (protectedAccount(config.account))
    throw new ProfileError(
      "protected_account",
      `The account ${config.account.toUpperCase()} is protected. The harness does not log in to it.`,
    );
  if (protectedCharacter(config.character))
    throw new ProfileError(
      "protected_character",
      `The character ${config.character} is protected. The harness does not log in to it.`,
    );
  return {
    account: config.account.toUpperCase(),
    character: config.character,
    client: clientConfig(config),
    path,
    source,
  };
}

export function clientConfig(cfg: Config): ClientConfig {
  return {
    account: cfg.account.toUpperCase(),
    character: cfg.character,
    dbc: cfg.spell_data_dir ? dbcDirectory(cfg.spell_data_dir) : undefined,
    host: cfg.host,
    jev: jevPort(Bun.env),
    language: cfg.language,
    navigation: navigationOf(cfg),
    password: cfg.password.toUpperCase(),
    port: cfg.port,
  };
}

function navigationOf(cfg: Config): NavigationSource | undefined {
  const { navigation_data_dir: dataDir, navigation_library: library } = cfg;
  if (!(dataDir && library)) return undefined;
  return navigationSource({ dataDir, library });
}

function protectedAccount(account: string): boolean {
  const upper = account.toUpperCase();
  return (
    PROTECTED_ACCOUNTS.includes(upper) ||
    PROTECTED_ACCOUNT_PREFIXES.some((prefix) => upper.startsWith(prefix))
  );
}

function protectedCharacter(character: string): boolean {
  return PROTECTED_CHARACTERS.some(
    (name) => name.toLowerCase() === character.toLowerCase(),
  );
}

async function readText(path: string): Promise<string> {
  const text = await Bun.file(path).text().catch(ignoreFailure);
  if (text === undefined)
    throw new ProfileError("unreadable", `Cannot read ${path}.`);
  return text;
}

async function parseProfile({
  path,
  text,
  home,
}: {
  path: string;
  text: string;
  home: string;
}): Promise<Parsed> {
  if (!text.trimStart().startsWith("{"))
    return { config: parseToml(text, path), source: "config_toml" };
  const json = parseJson(text, path);
  if (typeof json["dir"] === "string")
    return { config: await sessionConfig(json), source: "soap_session" };
  if (typeof json["createdAt"] === "string")
    return { config: await ledgerConfig(json, home), source: "soap_ledger" };
  throw new ProfileError(
    "unknown_format",
    `${path} is not a soap session, a soap ledger entry or a Peon config.toml.`,
  );
}

function attempt<T>(read: () => T): T | Error {
  try {
    return read();
  } catch (error) {
    return error instanceof Error
      ? error
      : new Error(messageOf(error), { cause: error });
  }
}

function parseJson(text: string, path: string): Json {
  const value: unknown = attempt(() => JSON.parse(text));
  if (value instanceof Error)
    throw new ProfileError(
      "unknown_format",
      `${path} is not valid JSON: ${value.message}`,
      { cause: value },
    );
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new ProfileError(
      "unknown_format",
      `${path} does not hold a JSON object.`,
    );
  return value as Json;
}

function parseToml(text: string, path: string): Config {
  const config = attempt(() => parseConfig(text));
  if (!(config instanceof Error)) return config;
  const code = config.message.startsWith("Missing required config field")
    ? "missing_field"
    : "unknown_format";
  throw new ProfileError(code, `${path}: ${config.message}`, { cause: config });
}

function field(json: Json, name: string): string {
  const value = json[name];
  if (typeof value !== "string" || value.length === 0)
    throw new ProfileError("missing_field", `The profile has no "${name}".`);
  return value;
}

async function sessionConfig(json: Json): Promise<Config> {
  const character = field(json, "character");
  const path = `${field(json, "dir")}/config/peon/config.toml`;
  const base = parseToml(await readText(path), path);
  const logsIn =
    base.account.toUpperCase() === field(json, "account").toUpperCase() &&
    base.character === character;
  if (!logsIn)
    throw new ProfileError(
      "unknown_format",
      `${path} logs in as ${base.account}/${base.character}, not as ${character}.`,
    );
  return { ...base, password: field(json, "password") };
}

async function ledgerConfig(json: Json, home: string): Promise<Config> {
  const nav = await navFields(`${home}/.config/peon/config.toml`);
  const language = ALLIANCE_PRESETS.includes(field(json, "preset")) ? 7 : 1;
  const [account, character, password] = [
    field(json, "account"),
    field(json, "character"),
    field(json, "password"),
  ];
  return {
    account,
    character,
    host: "t1",
    language,
    password,
    port: 3724,
    timeout_minutes: 30,
    ...nav,
  };
}

async function navFields(path: string): Promise<Partial<NavFields>> {
  const text = await Bun.file(path).text().catch(ignoreFailure);
  if (text === undefined) return {};
  const { spell_data_dir, navigation_data_dir, navigation_library } = parseToml(
    text,
    path,
  );
  return { navigation_data_dir, navigation_library, spell_data_dir };
}
