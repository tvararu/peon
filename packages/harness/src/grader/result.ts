import { type Schema, schemaErrors } from "#harness/grader/json-schema";
import schema from "./eval-result.schema.json" with { type: "json" };

export type EvalVerdict = "pass" | "fail" | "blocked" | "aborted";

export type AbortCause =
  | "soap_create"
  | "server_down"
  | "disconnect"
  | "credential_expired"
  | "rate_limited"
  | "jev_unavailable"
  | "launch_failed"
  | "wrong_character"
  | "grader_contamination"
  | "service_down"
  | "stale_truth"
  | "setup_failed"
  | "other";

export type EvalCheck = {
  id: string;
  source: "truth" | "verifier" | "witness" | "game_log" | "session" | "frame";
  expected: unknown;
  observed: unknown;
  met: boolean;
  botInterference?: boolean;
  blockedBy?: string;
  ref?: string;
};

export type EvalEfficiency = {
  toolCalls: number;
  toolCallsByName?: Record<string, number>;
  toolErrors?: number;
  turns: number;
  wallSec: number;
  exitSec?: number;
  timeToFirstActionSec?: number;
  tokens: {
    input?: number;
    cachedInput?: number;
    output?: number;
    reasoning?: number;
  };
  budgetRatio?: { toolCalls?: number; turns?: number; wallSec?: number };
};

export type EvalAttempts = {
  deaths?: number;
  kills?: number;
  blockedTargets?: number;
  refusals?: number;
  stops?: number;
  jevTimeouts?: number;
  botEvents?: {
    ms?: number;
    kind?: "whisper" | "invite" | "duel" | "trade" | "took_target" | "other";
    bot?: string;
    agentResponded?: boolean;
  }[];
};

export type EvalIntervention = {
  ms?: number;
  kind?: "steer" | "rescue" | "budget_stop";
  text?: string;
};

export type FrictionItem = {
  category:
    | "wrong-tool"
    | "missing-tool"
    | "missing-observation"
    | "stale-observation"
    | "misread-result"
    | "hallucinated-state"
    | "false-success-claim"
    | "repeated-call"
    | "poll-loop"
    | "unit-or-geometry-math"
    | "refusal-confusion"
    | "ignored-event"
    | "event-noise"
    | "slow-to-act"
    | "gave-up-early"
    | "ignored-steer"
    | "answered-playerbot"
    | "panel-misleading"
    | "prompt-confusion"
    | "crash-or-error"
    | "credential-leak"
    | "other";
  severity: "blocker" | "major" | "minor";
  quote: string;
  ref: string;
  count?: number;
  area: "tool" | "event" | "prompt" | "panel" | "core" | "eval";
  target?: string;
  suggestedFix?: string;
};

export type EvalEvidence = {
  runDir?: string;
  frames?: number;
  gameLog?: string;
  session?: string;
  baseline?: string;
  final?: string;
  finalSavedAt?: string;
};

export type EvalResult = {
  scenario: string;
  round: number;
  replica: number;
  sha: string;
  tab?: string;
  accounts?: string[];
  verdict: EvalVerdict;
  verdictReason?: string;
  blockedBy?: string[];
  abort?: { cause: AbortCause; evidence: string };
  end?: "done" | "budget" | "stuck" | "abort";
  checks: EvalCheck[];
  efficiency: EvalEfficiency;
  attempts?: EvalAttempts;
  interventions: EvalIntervention[];
  friction: FrictionItem[];
  evidence: EvalEvidence;
  notes?: string;
};

export function validateResult(value: unknown): string[] {
  return schemaErrors(schema as Schema, value);
}
