import { observeGameLog, parseGameLog } from "#harness/grader/draft-gamelog";
import { measureGameLog } from "#harness/grader/draft-measure";
import type { EvalCheck } from "#harness/grader/result";
import type { ScenarioCheck } from "#harness/grader/scenarios";
import type { Truth } from "#harness/grader/truth";
import { totalXp } from "#harness/grader/xp-table";

export type TruthSummary = Pick<
  Truth,
  | "alive"
  | "deathState"
  | "level"
  | "money"
  | "position"
  | "rewardedQuests"
  | "xp"
> & {
  items: Record<string, number>;
  quests: { quest: number; status: number }[];
};

export function truthSummary(truth: Truth): TruthSummary {
  const items: Record<string, number> = {};
  for (const { item, count } of truth.inventory)
    items[item] = (items[item] ?? 0) + count;
  return {
    alive: truth.alive,
    deathState: truth.deathState,
    items,
    level: truth.level,
    money: truth.money,
    position: truth.position,
    quests: truth.quests.map(({ quest, status }) => ({ quest, status })),
    rewardedQuests: truth.rewardedQuests,
    xp: truth.xp,
  };
}

type Pair = { baseline: Truth | null; final: Truth | null };
type Picked = Record<string, unknown>;
type Picker = (truth: Truth) => Picked;

const ID = /\b\d{3,}\b/g;
const POINT = /(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/;

const PICKS: readonly [RegExp, Picker][] = [
  [
    /total XP/i,
    ({ level, xp }) => ({ level, totalXp: totalXp(level, xp), xp }),
  ],
  [/\blevel\b/i, ({ level }) => ({ level })],
  [/\bmoney\b/i, ({ money }) => ({ money })],
  [
    /rewardedQuests|\bquests\b/,
    ({ quests, rewardedQuests }) => ({
      quests: quests.map(({ quest, status }) => ({ quest, status })),
      rewardedQuests,
    }),
  ],
  [/\balive\b|deathState/, ({ alive, deathState }) => ({ alive, deathState })],
  [
    /\bslots?\b|\bbag\b/,
    ({ inventory }) => ({
      inventory: inventory.map(({ bag, count, item, name, slot }) => ({
        bag,
        count,
        item,
        name,
        slot,
      })),
    }),
  ],
];

const TOTAL_XP = /total XP/i;
const MONEY = /\bmoney\b/i;
const NEAR_POINT = /position|\byd\b/;
const ITEMS = /\bitems?\b|inventory|\bcount\b/i;

function picksFor(expect: string): Picker[] {
  return PICKS.filter(
    ([pattern], index) =>
      pattern.test(expect) && !(index === 1 && TOTAL_XP.test(expect)),
  ).map(([, pick]) => pick);
}

const pickAll = (truth: Truth | null, picks: readonly Picker[]) =>
  truth === null
    ? null
    : Object.assign({}, ...picks.map((pick) => pick(truth)));

function delta(pair: Pair, expect: string): Picked | undefined {
  const { baseline, final } = pair;
  if (baseline === null || final === null) return undefined;
  const out: Picked = {};
  if (TOTAL_XP.test(expect))
    out["totalXp"] =
      totalXp(final.level, final.xp) - totalXp(baseline.level, baseline.xp);
  if (MONEY.test(expect)) out["money"] = final.money - baseline.money;
  return Object.keys(out).length > 0 ? out : undefined;
}

type ItemRow = {
  name?: string;
  baseline: number;
  final: number;
  delta: number;
};

function itemDeltas(pair: Pair, expect: string): Record<string, ItemRow> {
  const count = (truth: Truth | null): Map<number, number> => {
    const counts = new Map<number, number>();
    for (const { item, count: n } of truth?.inventory ?? [])
      counts.set(item, (counts.get(item) ?? 0) + n);
    return counts;
  };
  const names = new Map<number, string>();
  for (const { item, name } of [
    ...(pair.baseline?.inventory ?? []),
    ...(pair.final?.inventory ?? []),
  ])
    names.set(item, name);
  const before = count(pair.baseline);
  const after = count(pair.final);
  const listed = (expect.match(ID) ?? []).map(Number);
  const ids = new Set([...before.keys(), ...after.keys(), ...listed]);
  const out: Record<string, ItemRow> = {};
  for (const id of [...ids].toSorted((a, b) => a - b)) {
    const baseline = before.get(id) ?? 0;
    const final = after.get(id) ?? 0;
    const named = expect.includes(names.get(id) ?? "\u0000");
    if (baseline === final && !listed.includes(id) && !named) continue;
    out[id] = { baseline, delta: final - baseline, final, name: names.get(id) };
  }
  return out;
}

function positionObserved(pair: Pair, expect: string): Picked | undefined {
  const found = NEAR_POINT.test(expect) ? POINT.exec(expect) : null;
  if (found === null) return undefined;
  const point = { x: Number(found[1]), y: Number(found[2]) };
  const position = pair.final?.position;
  return {
    distance2d:
      position === undefined
        ? null
        : Math.round(
            Math.hypot(position.x - point.x, position.y - point.y) * 10,
          ) / 10,
    final: position === undefined ? null : { position },
    point,
  };
}

export function observeTruth(pair: Pair, expect: string): unknown {
  if (pair.baseline === null && pair.final === null) return null;
  const position = positionObserved(pair, expect);
  if (position !== undefined) return position;
  const items = ITEMS.test(expect) ? itemDeltas(pair, expect) : undefined;
  const picks = picksFor(expect);
  if (picks.length === 0 && items !== undefined) return { items };
  const all = picks.length === 0 ? [truthSummary as Picker] : picks;
  return {
    baseline: pickAll(pair.baseline, all),
    delta: delta(pair, expect),
    final: pickAll(pair.final, all),
    items,
  };
}

async function readTruthFile(file: string): Promise<Truth | null> {
  const handle = Bun.file(file);
  return (await handle.exists()) ? ((await handle.json()) as Truth) : null;
}

async function readGameLog(file: string) {
  const handle = Bun.file(file);
  return (await handle.exists()) ? parseGameLog(await handle.text()) : null;
}

export async function observedChecks(
  runDir: string,
  checks: readonly ScenarioCheck[],
): Promise<EvalCheck[]> {
  const pair = {
    baseline: await readTruthFile(`${runDir}/baseline.json`),
    final: await readTruthFile(`${runDir}/final.json`),
  };
  const rows = await readGameLog(`${runDir}/gamelog.jsonl`);
  return checks.map((check) => {
    const { blockedBy, expect, id, source } = check;
    const base = { blockedBy, expected: expect, id, met: false, source };
    if (source === "truth")
      return { ...base, observed: observeTruth(pair, expect) };
    if (source !== "game_log" || rows === null)
      return { ...base, observed: null };
    const { line, observed } =
      check.measure === undefined
        ? observedRows(rows, check)
        : measureGameLog(rows, check.measure);
    return line === undefined
      ? { ...base, observed }
      : { ...base, observed, ref: `gamelog.jsonl:${line}` };
  });
}

function observedRows(
  rows: ReturnType<typeof parseGameLog>,
  check: ScenarioCheck,
): { line?: number; observed: unknown } {
  const observed = observeGameLog(rows, check);
  return { line: observed?.match?.line, observed };
}
