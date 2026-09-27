import type { EvalCheck } from "#harness/grader/result";
import type { ScenarioCheck } from "#harness/grader/scenarios";
import type { Truth } from "#harness/grader/truth";

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

async function readSummary(file: string): Promise<TruthSummary | null> {
  const handle = Bun.file(file);
  if (!(await handle.exists())) return null;
  return truthSummary((await handle.json()) as Truth);
}

export async function observedChecks(
  runDir: string,
  checks: readonly ScenarioCheck[],
): Promise<EvalCheck[]> {
  const baseline = await readSummary(`${runDir}/baseline.json`);
  const final = await readSummary(`${runDir}/final.json`);
  const truth =
    baseline === null && final === null ? null : { baseline, final };
  return checks.map(({ expect, id, source }) => ({
    expected: expect,
    id,
    met: false,
    observed: source === "truth" ? truth : null,
    source,
  }));
}
