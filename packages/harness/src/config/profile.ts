import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type { ClientConfig } from "@peon/core";
import { type Config, parseConfig, realmDefaults } from "@peon/core/lib/config";
import { messageOf } from "@peon/core/lib/errors";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type {
  HarnessFlags,
  Profile,
  ProfileSource,
} from "#harness/contract/config";
import { jevPort } from "#harness/jev/port";
import { navigationSource } from "#harness/navigation/maps";
import type { NavigationSource } from "#harness/navigation/native";
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
type Parsed = { source: ProfileSource; config: Config; extensions: string[] };
type BaseFields = Pick<
  Config,
  | "host"
  | "port"
  | "spell_data_dir"
  | "navigation_data_dir"
  | "navigation_library"
>;

const ALLIANCE_PRESETS: readonly string[] = ["elwynn1", "elwynn10"];

export function isProtected(account: string, character: string): boolean {
  return protectedAccount(account) || protectedCharacter(character);
}

export async function loadProfile(
  path: string,
  home = homedir(),
): Promise<Profile> {
  const { source, config, extensions } = await parseProfile({
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
    extensions,
    jev: jevPort(Bun.env),
    navigation: navigationOf(config),
    path,
    source,
  };
}

export async function readableExtensions(
  profile: Pick<Profile, "extensions">,
  flags: Pick<HarnessFlags, "extensions">,
): Promise<string[]> {
  const paths = [...profile.extensions, ...flags.extensions];
  for (const path of paths)
    if (!(await Bun.file(path).exists()))
      throw new ProfileError(
        "unreadable",
        `Cannot read the extension ${path}.`,
      );
  return paths;
}

export function clientConfig(cfg: Config): ClientConfig {
  return {
    account: cfg.account.toUpperCase(),
    character: cfg.character,
    dbc: cfg.spell_data_dir ? dbcDirectory(cfg.spell_data_dir) : undefined,
    host: cfg.host,
    language: cfg.language,
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
  if (!text.trimStart().startsWith("{")) {
    const config = parseToml(text, path);
    const table: unknown = Bun.TOML.parse(text);
    return {
      config,
      extensions: extensionsOf(table, path),
      source: "config_toml",
    };
  }
  const json = parseJson(text, path);
  const extensions = extensionsOf(json, path);
  if (typeof json["dir"] === "string")
    return {
      config: await sessionConfig(json),
      extensions,
      source: "soap_session",
    };
  if (typeof json["createdAt"] === "string")
    return {
      config: await ledgerConfig(json, home),
      extensions,
      source: "soap_ledger",
    };
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

function extensionsOf(table: unknown, path: string): string[] {
  const value =
    typeof table === "object" && table !== null && "extensions" in table
      ? table.extensions
      : [];
  if (
    !(
      Array.isArray(value) &&
      value.every((entry) => typeof entry === "string" && entry.length > 0)
    )
  )
    throw new ProfileError(
      "unknown_format",
      `${path}: "extensions" must be a list of file paths.`,
    );
  return value.map((entry: string) => resolve(dirname(path), entry));
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
  const base = await baseFields(`${home}/.config/peon/config.toml`);
  const language = ALLIANCE_PRESETS.includes(field(json, "preset")) ? 7 : 1;
  const [account, character, password] = [
    field(json, "account"),
    field(json, "character"),
    field(json, "password"),
  ];
  return {
    account,
    character,
    language,
    password,
    timeout_minutes: 30,
    ...base,
  };
}

async function baseFields(path: string): Promise<BaseFields> {
  const text = await Bun.file(path).text().catch(ignoreFailure);
  if (text === undefined) return { ...realmDefaults };
  const {
    host,
    port,
    spell_data_dir,
    navigation_data_dir,
    navigation_library,
  } = parseToml(text, path);
  return {
    host,
    navigation_data_dir,
    navigation_library,
    port,
    spell_data_dir,
  };
}
