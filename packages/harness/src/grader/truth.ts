import { basename, relative } from "node:path";
import { messageOf } from "@peon/core/lib/errors";
import type { Clock } from "#harness/contract/services";
import { type Exec, isRecord, parseJsonOutput } from "#harness/grader/exec";

export type TruthItem = {
  bag: number;
  slot: number;
  item: number;
  name: string;
  count: number;
  durability?: number;
  maxDurability?: number;
};

export type TruthHearth = {
  map: number;
  zone: number;
  x: number;
  y: number;
  z: number;
};

export type TruthReputation = {
  faction: number;
  standing: number;
  flags: number;
};

export type TruthMail = {
  id: number;
  subject: string;
  money: number;
  items: number;
};

export type TruthQuest = {
  quest: number;
  status: number;
  rewarded: boolean;
  mobCounts: number[];
  itemCounts: number[];
};

export type Truth = {
  ok: true;
  online: boolean;
  savedAt: string;
  guid: number;
  account: string;
  name: string;
  race: number;
  class: number;
  level: number;
  xp: number;
  money: number;
  position: {
    map: number;
    zone: number;
    x: number;
    y: number;
    z: number;
    o: number;
  };
  alive: boolean;
  deathState: "alive" | "dead" | "ghost";
  health: number;
  inventory: TruthItem[];
  quests: TruthQuest[];
  rewardedQuests: number[];
  spells: number[];
  hearth?: TruthHearth;
  reputation?: TruthReputation[];
  mail?: TruthMail[];
};

export type FinalTruth =
  | { ok: true; truth: Truth }
  | { ok: false; cause: "stale_truth" | "service_down"; detail: string };

export const TRUTH_ARGV = [
  "bun",
  "packages/factory/src/main.ts",
  "soap",
  "truth",
] as const;
export const STALE_SLACK_MS = 5000;

const DEATH_STATES = ["alive", "dead", "ghost"] as const;
const TRUTH_TIMEOUT_MS = 30_000;

type Json = Record<string, unknown>;

function fields(json: Json, where: string) {
  const fail = (key: string, what: string): never => {
    throw new Error(`${where}.${key}: expected ${what}`);
  };
  const num = (key: string): number => {
    const value = json[key];
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : fail(key, "a number");
  };
  const arr = (key: string): unknown[] => {
    const value = json[key];
    return Array.isArray(value) ? value : fail(key, "an array");
  };
  return {
    arr,
    bool: (key: string): boolean =>
      typeof json[key] === "boolean"
        ? (json[key] as boolean)
        : fail(key, "a boolean"),
    num,
    nums: (key: string): number[] =>
      arr(key).map((value, i) =>
        typeof value === "number" ? value : fail(`${key}[${i}]`, "a number"),
      ),
    obj: (key: string): Json =>
      isRecord(json[key]) ? (json[key] as Json) : fail(key, "an object"),
    str: (key: string): string =>
      typeof json[key] === "string"
        ? (json[key] as string)
        : fail(key, "a string"),
  };
}

function record(value: unknown, where: string): Json {
  if (!isRecord(value)) throw new Error(`${where}: expected an object`);
  return value;
}

function optional<T>(
  json: Json,
  key: string,
  read: (key: string) => T,
): Record<string, T> {
  return json[key] === undefined || json[key] === null
    ? {}
    : { [key]: read(key) };
}

function itemOf(value: unknown, where: string): TruthItem {
  const json = record(value, where);
  const f = fields(json, where);
  return {
    bag: f.num("bag"),
    count: f.num("count"),
    item: f.num("item"),
    name: f.str("name"),
    slot: f.num("slot"),
    ...optional(json, "durability", f.num),
    ...optional(json, "maxDurability", f.num),
  };
}

function hearthOf(json: Json): TruthHearth {
  const f = fields(json, "truth.hearth");
  return {
    map: f.num("map"),
    x: f.num("x"),
    y: f.num("y"),
    z: f.num("z"),
    zone: f.num("zone"),
  };
}

function reputationOf(value: unknown, where: string): TruthReputation {
  const f = fields(record(value, where), where);
  return {
    faction: f.num("faction"),
    flags: f.num("flags"),
    standing: f.num("standing"),
  };
}

function mailOf(value: unknown, where: string): TruthMail {
  const f = fields(record(value, where), where);
  return {
    id: f.num("id"),
    items: f.num("items"),
    money: f.num("money"),
    subject: f.str("subject"),
  };
}

function questOf(value: unknown, where: string): TruthQuest {
  const f = fields(record(value, where), where);
  return {
    itemCounts: f.nums("itemCounts"),
    mobCounts: f.nums("mobCounts"),
    quest: f.num("quest"),
    rewarded: f.bool("rewarded"),
    status: f.num("status"),
  };
}

function positionOf(json: Json): Truth["position"] {
  const f = fields(json, "truth.position");
  return {
    map: f.num("map"),
    o: f.num("o"),
    x: f.num("x"),
    y: f.num("y"),
    z: f.num("z"),
    zone: f.num("zone"),
  };
}

function deathStateOf(value: string): Truth["deathState"] {
  const state = DEATH_STATES.find((name) => name === value);
  if (state === undefined)
    throw new Error(`truth.deathState: expected ${DEATH_STATES.join("|")}`);
  return state;
}

export function parseTruth(json: unknown): Truth {
  const reply = record(json, "truth");
  if (reply["ok"] !== true)
    throw new Error(`truth refused: ${String(reply["reason"] ?? "no reason")}`);
  const f = fields(reply, "truth");
  return {
    account: f.str("account"),
    alive: f.bool("alive"),
    class: f.num("class"),
    deathState: deathStateOf(f.str("deathState")),
    guid: f.num("guid"),
    health: f.num("health"),
    inventory: f
      .arr("inventory")
      .map((row, i) => itemOf(row, `truth.inventory[${i}]`)),
    level: f.num("level"),
    money: f.num("money"),
    name: f.str("name"),
    ok: true,
    online: f.bool("online"),
    position: positionOf(f.obj("position")),
    quests: f.arr("quests").map((row, i) => questOf(row, `truth.quests[${i}]`)),
    race: f.num("race"),
    rewardedQuests: f.nums("rewardedQuests"),
    savedAt: f.str("savedAt"),
    spells: f.nums("spells"),
    xp: f.num("xp"),
    ...optional(reply, "hearth", (key) => hearthOf(f.obj(key))),
    ...optional(reply, "reputation", (key) =>
      f.arr(key).map((row, i) => reputationOf(row, `truth.${key}[${i}]`)),
    ),
    ...optional(reply, "mail", (key) =>
      f.arr(key).map((row, i) => mailOf(row, `truth.${key}[${i}]`)),
    ),
  };
}

export async function readTruth(exec: Exec, account: string): Promise<Truth> {
  const { code, stderr, stdout } = await exec([...TRUTH_ARGV, account], {
    timeoutMs: TRUTH_TIMEOUT_MS,
  });
  const json = parseJsonOutput(stdout);
  if (json === undefined)
    throw new Error(`soap truth exited ${code}: ${stderr.trim()}`);
  return parseTruth(json);
}

type FinalInit = {
  exec: Exec;
  account: string;
  exitMs: number;
  clock?: Clock;
  offlineWithinMs?: number;
  waitMs?: number;
};
type Read = { truth: Truth } | { error: string };

export const OFFLINE_WAIT_MS = 90_000;

const SYSTEM_CLOCK: Clock = { now: () => Date.now() };

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function isFresh(truth: Truth, exitMs: number): boolean {
  return Date.parse(truth.savedAt) >= exitMs - STALE_SLACK_MS;
}

function staleDetail(truth: Truth, exitMs: number): string {
  return `online=${truth.online} savedAt=${truth.savedAt} exit=${new Date(exitMs).toISOString()}`;
}

export async function finalTruth({
  exec,
  account,
  exitMs,
  clock = SYSTEM_CLOCK,
  offlineWithinMs = OFFLINE_WAIT_MS,
  waitMs = 10_000,
}: FinalInit): Promise<FinalTruth> {
  const deadline = clock.now() + offlineWithinMs;
  const reads = Math.ceil(offlineWithinMs / waitMs) + 1;
  for (let attempt = 1; ; attempt += 1) {
    const read: Read = await readTruth(exec, account).then(
      (truth) => ({ truth }),
      (err: unknown) => ({ error: messageOf(err) }),
    );
    if ("error" in read)
      return { cause: "service_down", detail: read.error, ok: false };
    const last = read.truth;
    if (!last.online)
      return isFresh(last, exitMs)
        ? { ok: true, truth: last }
        : {
            cause: "stale_truth",
            detail: staleDetail(last, exitMs),
            ok: false,
          };
    const left = deadline - clock.now();
    if (left <= 0 || attempt >= reads)
      return {
        cause: "stale_truth",
        detail: staleDetail(last, exitMs),
        ok: false,
      };
    await delay(Math.min(waitMs, left));
  }
}

type LeakInit = { exec: Exec; runDir: string; secretFiles: readonly string[] };

async function passwordIn(file: string): Promise<string> {
  const handle = Bun.file(file);
  if (!(await handle.exists())) return "";
  const json: unknown = await handle.json();
  const password = isRecord(json) ? json["password"] : undefined;
  return typeof password === "string" ? password : "";
}

export async function leakCheck({
  exec,
  runDir,
  secretFiles,
}: LeakInit): Promise<string[]> {
  const secrets = (await Promise.all(secretFiles.map(passwordIn))).filter(
    (secret) => secret.length > 0,
  );
  if (secrets.length === 0) return [];
  const skip = secretFiles.flatMap((file) => ["--glob", `!${basename(file)}`]);
  const argv = ["rg", "-uu", "-l", "-F", "-f", "-", ...skip, runDir];
  const { code, stderr, stdout } = await exec(argv, {
    stdin: `${secrets.join("\n")}\n`,
  });
  if (code === 1) return [];
  if (code !== 0) throw new Error(`rg exited ${code}: ${stderr.trim()}`);
  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => relative(runDir, line))
    .toSorted();
}
