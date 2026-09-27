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
  ref?: string;
};

export type EvalEfficiency = {
  toolCalls: number;
  toolCallsByName?: Record<string, number>;
  toolErrors?: number;
  turns: number;
  wallSec: number;
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

type Schema = {
  type?: string;
  required?: readonly string[];
  properties?: Readonly<Record<string, Schema>>;
  items?: Schema;
  enum?: readonly unknown[];
  pattern?: string;
  minimum?: number;
  maxLength?: number;
  additionalProperties?: Schema | boolean;
};

const ROOT = schema as Schema;

export function validateResult(value: unknown): string[] {
  return errorsAt(ROOT, value, "$");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasType(type: string | undefined, value: unknown): boolean {
  if (type === undefined) return true;
  if (type === "integer") return Number.isInteger(value);
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  return typeof value === type;
}

function errorsAt(node: Schema, value: unknown, path: string): string[] {
  if (node.enum !== undefined)
    return node.enum.includes(value)
      ? []
      : [`${path}: expected one of ${node.enum.join("|")}`];
  if (!hasType(node.type, value)) return [`${path}: expected ${node.type}`];
  if (Array.isArray(value))
    return value.flatMap((item, i) =>
      node.items ? errorsAt(node.items, item, `${path}[${i}]`) : [],
    );
  if (isObject(value)) return objectErrors(node, value, path);
  return scalarErrors(node, value, path);
}

function objectErrors(
  node: Schema,
  value: Record<string, unknown>,
  path: string,
): string[] {
  const properties = node.properties ?? {};
  const missing = (node.required ?? [])
    .filter((key) => !Object.hasOwn(value, key))
    .map((key) => `${path}: missing ${key}`);
  const listed = Object.entries(properties).flatMap(([key, child]) =>
    Object.hasOwn(value, key)
      ? errorsAt(child, value[key], `${path}.${key}`)
      : [],
  );
  return [...missing, ...listed, ...extraErrors(node, value, path)];
}

function extraErrors(
  node: Schema,
  value: Record<string, unknown>,
  path: string,
): string[] {
  const extra = node.additionalProperties;
  if (typeof extra !== "object") return [];
  const properties = node.properties ?? {};
  return Object.entries(value)
    .filter(([key]) => !Object.hasOwn(properties, key))
    .flatMap(([key, child]) => errorsAt(extra, child, `${path}.${key}`));
}

function scalarErrors(node: Schema, value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (
    node.pattern !== undefined &&
    typeof value === "string" &&
    !new RegExp(node.pattern).test(value)
  ) {
    errors.push(`${path}: does not match ${node.pattern}`);
  }
  if (
    node.minimum !== undefined &&
    typeof value === "number" &&
    value < node.minimum
  ) {
    errors.push(`${path}: below minimum ${node.minimum}`);
  }
  if (
    node.maxLength !== undefined &&
    typeof value === "string" &&
    value.length > node.maxLength
  ) {
    errors.push(`${path}: longer than ${node.maxLength}`);
  }
  return errors;
}
