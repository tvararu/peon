import type {
  JevActionRequest,
  JevActionResult,
  JevCandidate,
  JevSelect,
} from "#harness/jev/contract";

export const GREEDY_MODEL = "code:greedy";

export type GreedyCandidate = JevCandidate & {
  goalDeg?: number;
  turnDeg?: number;
};

export function greedyChoice(
  candidates: readonly GreedyCandidate[],
): string | undefined {
  const moves = candidates.filter((candidate) => candidate.id !== "stop");
  const rest =
    moves.length > 0
      ? moves
      : candidates.filter((candidate) => candidate.id === "stop");
  if (rest.length === 0) return undefined;
  const nonJump = rest.filter((candidate) => candidate.id !== "jump_ahead");
  const pool = nonJump.length > 0 ? nonJump : rest;
  return pool.slice().sort(compareGreedy)[0]?.id;
}

function compareGreedy(a: GreedyCandidate, b: GreedyCandidate): number {
  const bearing = bearingOf(a) - bearingOf(b);
  if (bearing !== 0) return bearing;
  const run = runFirst(a, b);
  if (run !== 0) return run;
  const turn = turnOf(a) - turnOf(b);
  if (turn !== 0) return turn;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function bearingOf(candidate: GreedyCandidate): number {
  return candidate.goalDeg ?? Number.POSITIVE_INFINITY;
}

function runFirst(a: GreedyCandidate, b: GreedyCandidate): number {
  if (a.id === "run_ahead" && b.id !== "run_ahead") return -1;
  if (b.id === "run_ahead" && a.id !== "run_ahead") return 1;
  return 0;
}

function turnOf(candidate: GreedyCandidate): number {
  return Math.abs(candidate.turnDeg ?? Number.POSITIVE_INFINITY);
}

export function greedySelect(request: JevActionRequest): string | undefined {
  return greedyChoice(request.candidates);
}

export function createGreedySelect(): JevSelect {
  return (request, { record, signal }) => {
    const started = performance.now();
    signal.throwIfAborted();
    const choice = greedyChoice(request.candidates);
    if (choice === undefined) throw new Error("No greedy pilot candidates");
    const result: JevActionResult = {
      choice,
      confidence: 1,
      elapsedMs: performance.now() - started,
      inputTokens: 0,
      model: GREEDY_MODEL,
      probabilities: { [choice]: 1 },
    };
    record?.({
      elapsedMs: result.elapsedMs,
      instructions: "greedy goal bearing",
      model: GREEDY_MODEL,
    });
    return Promise.resolve(result);
  };
}
