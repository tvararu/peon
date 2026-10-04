import type { JevCandidate } from "#harness/jev/contract";

export const WAIT_CANDIDATE = {
  id: "wait",
  description:
    "Hold current state and start nothing new: if moving, this refreshes the current direction's movement lease; if stationary, this is a no-op. Use stop_moving to release movement explicitly.",
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
