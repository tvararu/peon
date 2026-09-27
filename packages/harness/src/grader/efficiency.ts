import { isRecord, parseJsonOutput } from "#harness/grader/exec";
import type { EvalEfficiency } from "#harness/grader/result";
import type { Scenario } from "#harness/grader/scenarios";

export type SessionUsage = {
  turns: number;
  toolCalls: number;
  toolCallsByName: Record<string, number>;
  toolErrors: number;
  tokens: {
    input: number;
    cachedInput: number;
    output: number;
    reasoning: number;
  };
};

type EfficiencyInit = {
  usage: SessionUsage;
  wallMs: number;
  exitMs?: number;
  budget: Scenario["budget"];
  firstActionMs: number | undefined;
};

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;
const ratio = (value: number, cap: number): number =>
  Math.round((value / cap) * 100) / 100;

function emptyUsage(): SessionUsage {
  return {
    tokens: { cachedInput: 0, input: 0, output: 0, reasoning: 0 },
    toolCalls: 0,
    toolCallsByName: {},
    toolErrors: 0,
    turns: 0,
  };
}

function messageIn(entry: unknown): Record<string, unknown> | undefined {
  if (!isRecord(entry) || entry["type"] !== "message") return undefined;
  const message = entry["message"];
  return isRecord(message) ? message : undefined;
}

function toolNames(content: unknown): string[] {
  const parts = Array.isArray(content) ? content : [];
  return parts.flatMap((part) =>
    isRecord(part) &&
    part["type"] === "toolCall" &&
    typeof part["name"] === "string"
      ? [part["name"]]
      : [],
  );
}

function addAssistant(
  usage: SessionUsage,
  message: Record<string, unknown>,
): void {
  const tokens = isRecord(message["usage"]) ? message["usage"] : {};
  usage.turns += 1;
  usage.tokens.input += count(tokens["input"]);
  usage.tokens.cachedInput += count(tokens["cacheRead"]);
  usage.tokens.output += count(tokens["output"]);
  usage.tokens.reasoning += count(tokens["reasoning"]);
  for (const name of toolNames(message["content"])) {
    usage.toolCalls += 1;
    usage.toolCallsByName[name] = (usage.toolCallsByName[name] ?? 0) + 1;
  }
}

export function sessionUsage(jsonl: string): SessionUsage {
  const usage = emptyUsage();
  for (const line of jsonl.split("\n")) {
    const message = messageIn(parseJsonOutput(line));
    if (message?.["role"] === "assistant") addAssistant(usage, message);
    if (message?.["role"] === "toolResult" && message["isError"] === true)
      usage.toolErrors += 1;
  }
  return usage;
}

export async function readSessionUsage(file: string): Promise<SessionUsage> {
  const handle = Bun.file(file);
  return sessionUsage((await handle.exists()) ? await handle.text() : "");
}

export function efficiency({
  usage,
  wallMs,
  exitMs,
  budget,
  firstActionMs,
}: EfficiencyInit): EvalEfficiency {
  const wallSec = wallMs / 1000;
  return {
    budgetRatio: {
      toolCalls: ratio(usage.toolCalls, budget.tools),
      turns: ratio(usage.turns, budget.turns),
      wallSec: ratio(wallSec, budget.minutes * 60),
    },
    exitSec: exitMs === undefined ? undefined : exitMs / 1000,
    timeToFirstActionSec:
      firstActionMs === undefined ? undefined : firstActionMs / 1000,
    tokens: { ...usage.tokens },
    toolCalls: usage.toolCalls,
    toolCallsByName: { ...usage.toolCallsByName },
    toolErrors: usage.toolErrors,
    turns: usage.turns,
    wallSec,
  };
}
