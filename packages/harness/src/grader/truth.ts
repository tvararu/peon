import { messageOf } from "@tuicraft/core/lib/errors";
import { type Exec, isRecord, parseJsonOutput } from "#harness/grader/exec";

export type TruthItem = {
  bag: number;
  slot: number;
  item: number;
  name: string;
  count: number;
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

function itemOf(value: unknown, where: string): TruthItem {
  const f = fields(record(value, where), where);
  return {
    bag: f.num("bag"),
    count: f.num("count"),
    item: f.num("item"),
    name: f.str("name"),
    slot: f.num("slot"),
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
  retries?: number;
  waitMs?: number;
};
type Read = { truth: Truth } | { error: string };

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function isFresh(truth: Truth, exitMs: number): boolean {
  return !truth.online && Date.parse(truth.savedAt) >= exitMs - STALE_SLACK_MS;
}

function staleDetail(truth: Truth | undefined, exitMs: number): string {
  if (truth === undefined) return "no truth read";
  return `online=${truth.online} savedAt=${truth.savedAt} exit=${new Date(exitMs).toISOString()}`;
}

export async function finalTruth({
  exec,
  account,
  exitMs,
  retries = 3,
  waitMs = 10_000,
}: FinalInit): Promise<FinalTruth> {
  let last: Truth | undefined;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    if (attempt > 1) await delay(waitMs);
    const read: Read = await readTruth(exec, account).then(
      (truth) => ({ truth }),
      (err: unknown) => ({ error: messageOf(err) }),
    );
    if ("error" in read)
      return { cause: "service_down", detail: read.error, ok: false };
    last = read.truth;
    if (isFresh(last, exitMs)) return { ok: true, truth: last };
  }
  return { cause: "stale_truth", detail: staleDetail(last, exitMs), ok: false };
}
