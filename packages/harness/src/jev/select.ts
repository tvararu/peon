import { abortReason, isAbort } from "@peon/core/lib/abort";
import { messageOf } from "@peon/core/lib/errors";
import type {
  JevActionRequest,
  JevActionResult,
  JevExchange,
} from "#harness/jev/contract";
import { JevTransportError } from "#harness/jev/failure";
import { buildFraming } from "#harness/jev/framing";
import { httpFailure } from "#harness/jev/http-failure";

const SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_MODEL = "jev-latest";
const INSTRUCTIONS =
  "Which currently legal action best serves `standingInstruction`?";

export type JevActionOptions = {
  apiKey: string;
  signal: AbortSignal;
  model?: string;
  endpointUrl?: string;
  record?: (exchange: JevExchange) => void;
  fetch?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
};

export type JevHttpSelect = (
  request: JevActionRequest,
  options: JevActionOptions,
) => Promise<JevActionResult>;

type Envelope = Pick<JevExchange, "framing" | "instructions" | "model">;
type Reply = Pick<JevExchange, "error" | "response" | "status">;

export async function selectJevAction(
  request: JevActionRequest,
  options: JevActionOptions,
): Promise<JevActionResult> {
  if (!options.apiKey) throw new Error("Missing TypeSafe API key");
  if (options.signal.aborted) throw abortReason(options.signal);
  const allowed = new Set(request.candidates.map((candidate) => candidate.id));
  if (allowed.size === 0) throw new Error("No TypeSafe Choice candidates");
  const envelope = envelopeOf(request, options.model);
  const started = performance.now();
  const record = (reply: Reply) =>
    options.record?.({
      ...envelope,
      elapsedMs: performance.now() - started,
      ...reply,
    });
  const body = buildBody(request, envelope);
  const payload = await post(body, options, record);
  if (options.signal.aborted) throw abortReason(options.signal);
  return parseChoice(payload, allowed, performance.now() - started);
}

function envelopeOf(
  request: JevActionRequest,
  model = DEFAULT_MODEL,
): Envelope {
  const framing =
    request.framing &&
    buildFraming(request.framing, request.observation, request.characterClass);
  const envelope = { instructions: INSTRUCTIONS, model };
  return framing === undefined ? envelope : { ...envelope, framing };
}

function buildBody(
  request: JevActionRequest,
  { framing, instructions, model }: Envelope,
): string {
  const criteria = Object.fromEntries(
    request.candidates.map(({ id, description }) => [id, description]),
  );
  const state = {
    ...request.observation,
    standingInstruction: request.instruction,
    ...(framing === undefined ? {} : { framing }),
  };
  return JSON.stringify({
    model,
    questions: { action: { criteria, instructions, type: "choice" } },
    state,
  });
}

async function post(
  body: string,
  options: JevActionOptions,
  record: (reply: Reply) => void,
): Promise<unknown> {
  const http = options.fetch ?? globalThis.fetch;
  const headers = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
  };
  let response: Response;
  try {
    response = await http(options.endpointUrl ?? SYSTEMONE_URL, {
      body,
      headers,
      method: "POST",
      signal: options.signal,
    });
  } catch (error) {
    record({ error: messageOf(error) });
    if (options.signal.aborted || isAbort(error))
      throw abortReason(options.signal, error);
    throw new JevTransportError(messageOf(error), { cause: error });
  }
  const { ok, status } = response;
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    record({ error: messageOf(error), status });
    if (options.signal.aborted) throw abortReason(options.signal);
    if (!ok) throw httpFailure(status, undefined);
    throw responseError("json", { error });
  }
  const parsed = parseJson(text);
  record(text === "" ? { status } : { response: parsed.value, status });
  if (options.signal.aborted) throw abortReason(options.signal);
  if (!ok) throw httpFailure(status, parsed.value);
  if (parsed.error !== undefined)
    throw responseError("json", { error: parsed.error });
  return parsed.value;
}

function parseJson(text: string): { value: unknown; error?: unknown } {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { error, value: text };
  }
}

function parseChoice(
  payload: unknown,
  allowed: Set<string>,
  elapsedMs: number,
): JevActionResult {
  const root = asRecord(payload);
  const action = asRecord(asRecord(root?.["answers"])?.["action"]);
  if (action?.["type"] !== "choice") throw responseError("answers.action.type");
  const choice = action["choice"];
  if (typeof choice !== "string") throw responseError("answers.action.choice");
  if (!allowed.has(choice))
    throw new Error(`Unknown TypeSafe Choice id: ${choice}`);
  const model = root?.["model"];
  const confidence = action["confidence"];
  const usage = asRecord(root?.["usage"]);
  const inputTokens = usage?.["input_tokens"];
  const outputTokens = usage?.["output_tokens"];
  const probabilities = parseProbabilities(action["probabilities"], allowed);
  if (typeof model !== "string" || model.length === 0)
    throw responseError("model");
  if (!inUnit(confidence)) throw responseError("answers.action.confidence");
  if (!isTokenCount(inputTokens)) throw responseError("usage.input_tokens");
  if (outputTokens !== undefined && !isTokenCount(outputTokens))
    throw responseError("usage.output_tokens");
  return { choice, confidence, elapsedMs, inputTokens, model, probabilities };
}

function parseProbabilities(
  value: unknown,
  allowed: Set<string>,
): Record<string, number> {
  const record = asRecord(value);
  if (!record) throw responseError("probabilities");
  const keys = Object.keys(record);
  if (keys.length !== allowed.size)
    throw responseError("probabilities.keys", {
      expected: allowed.size,
      received: keys.length,
    });
  const entries: [string, number][] = [];
  let total = 0;
  for (const key of keys) {
    if (!allowed.has(key))
      throw responseError("probabilities.keys", { index: entries.length });
    const probability = record[key];
    if (!inUnit(probability))
      throw responseError("probabilities.value", { index: entries.length });
    entries.push([key, probability]);
    total += probability;
  }

  const delta = Math.abs(total - 1);
  if (delta > 2e-2) throw responseError("probabilities.total", { total });
  if (delta > 1e-6)
    return Object.fromEntries(
      entries.map(([key, probability]) => [key, probability / total]),
    );
  return Object.fromEntries(entries);
}

function responseError(
  field: string,
  details?: Record<string, unknown>,
): Error {
  const total = details?.["total"];
  const evidence = typeof total === "number" ? ` (${total})` : "";
  return new Error(`Malformed TypeSafe Choice response: ${field}${evidence}`, {
    cause: { field, ...details },
  });
}

function isTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function inUnit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  return value as Record<string, unknown>;
}
