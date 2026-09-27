import { readdir } from "node:fs/promises";
import { isRecord } from "#harness/grader/exec";
import { loadScenario, type Scenario } from "#harness/grader/scenarios";

const STALE_GRACE_MS = 5 * 60_000;
const FINISHED = ["result.json", "grader/draft.json"];

export function fieldClashes(ids: readonly string[]): string[] {
  const first = new Map<string, string>();
  return ids.flatMap((id) => {
    const { field } = loadScenario(id);
    if (field === undefined) return [];
    const earlier = first.get(field);
    if (earlier === undefined) {
      first.set(field, id);
      return [];
    }
    return [`${earlier} and ${id} share field ${field}`];
  });
}

type Sibling = { name: string; scenario: Scenario; t0: number };

async function siblingOf(
  round: string,
  name: string,
): Promise<Sibling | undefined> {
  const file = Bun.file(`${round}/${name}/run.json`);
  if (!(await file.exists())) return undefined;
  const json: unknown = await file.json();
  if (!isRecord(json)) return undefined;
  const { scenario, t0 } = json;
  if (typeof scenario !== "string" || typeof t0 !== "number") return undefined;
  return { name, scenario: loadScenario(scenario), t0 };
}

async function running(
  round: string,
  sibling: Sibling,
  now: number,
): Promise<boolean> {
  if (now - sibling.t0 > sibling.scenario.paneMinutes * 60_000 + STALE_GRACE_MS)
    return false;
  for (const file of FINISHED)
    if (await Bun.file(`${round}/${sibling.name}/${file}`).exists())
      return false;
  return true;
}

type ClashInit = { round: string; scenario: Scenario; now: number };

export async function liveClash({
  round,
  scenario,
  now,
}: ClashInit): Promise<string | undefined> {
  const { field } = scenario;
  if (field === undefined) return undefined;
  const entries = await readdir(round, { withFileTypes: true }).catch(() => []);
  for (const entry of entries
    .filter((item) => item.isDirectory())
    .toSorted((a, b) => a.name.localeCompare(b.name))) {
    const sibling = await siblingOf(round, entry.name);
    if (
      sibling?.scenario.field !== field ||
      !(await running(round, sibling, now))
    )
      continue;
    return `${sibling.name} is still running on field ${field}; ${scenario.id} shares that field, so run it after that run ends`;
  }
  return undefined;
}
