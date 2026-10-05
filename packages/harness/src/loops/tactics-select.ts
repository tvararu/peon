import type { JevCandidate } from "#harness/jev/contract";

export const WAIT_CANDIDATE = {
  id: "wait",
  description:
    "Hold current state and start nothing new. A move already running stops by itself about 1.5 s after it was chosen unless a later decision chooses it again; choose stop to end it now.",
} as const;

export function judge(
  choice: string,
  ageMs: number,
  maxAgeMs: number,
  offered: readonly JevCandidate[],
): string | undefined {
  if (ageMs > maxAgeMs) return "stale_age";
  if (!offers(offered, choice)) return "unknown_id";
  return undefined;
}

export function offers(
  candidates: readonly JevCandidate[],
  id: string,
): boolean {
  return candidates.some((candidate) => candidate.id === id);
}

export function withWait(
  candidates: readonly JevCandidate[],
  wait: JevCandidate | null = WAIT_CANDIDATE,
): JevCandidate[] {
  const list = candidates.map((candidate) => ({ ...candidate }));
  if (wait === null || offers(list, wait.id)) return list;
  list.push({ ...wait });
  return list;
}
