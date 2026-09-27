import type { Scenario } from "#harness/grader/scenarios";

export type Preflight = (key: string) => Promise<boolean>;

export const heldUntilRemoved: Preflight = async () => true;

export async function blockersOf(
  scenario: Scenario,
  stillBlocked: Preflight,
): Promise<string[]> {
  const blocked: string[] = [];
  for (const key of scenario.blockedBy ?? [])
    if (await stillBlocked(key)) blocked.push(key);
  return blocked;
}
