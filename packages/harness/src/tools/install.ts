import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  ExtensionAPI,
  MessageEndEventResult,
  ToolExecutionEndEvent,
} from "@earendil-works/pi-coding-agent";
import type { ToolName } from "#harness/contract/result";
import type { HarnessRuntime } from "#harness/contract/services";
import { GAME_TOOLS } from "#harness/tools/registry";

const VALIDATION = 'Validation failed for tool "';
const HINT_AFTER = 2;

type Misses = Map<ToolName, number>;

function listed(name: string) {
  return GAME_TOOLS.find((tool) => tool.name === name);
}

function firstText(value: unknown): string {
  if (
    !(
      value &&
      typeof value === "object" &&
      "content" in value &&
      Array.isArray(value.content)
    )
  )
    return "";
  const [first]: unknown[] = value.content;
  return first &&
    typeof first === "object" &&
    "text" in first &&
    typeof first.text === "string"
    ? first.text
    : "";
}

function countMiss(
  event: ToolExecutionEndEvent,
  misses: Misses,
  rt: HarnessRuntime,
): void {
  const tool = listed(event.toolName)?.name;
  if (!tool) return;
  if (!(event.isError && firstText(event.result).startsWith(VALIDATION))) {
    misses.set(tool, 0);
    return;
  }
  const count = (misses.get(tool) ?? 0) + 1;
  misses.set(tool, count);
  rt.stats.validationError(tool);
  const text = `${tool} arguments failed the schema (${count} in a row)`;
  rt.log.append({
    class: "log",
    data: { count, toolCallId: event.toolCallId },
    domain: "tool",
    event: "tool/validation_error",
    text,
    tool,
  });
}

function hintMiss(
  message: AgentMessage,
  misses: Misses,
): MessageEndEventResult | undefined {
  if (message.role !== "toolResult" || !message.isError) return;
  const tool = listed(message.toolName);
  if (!tool || (misses.get(tool.name) ?? 0) < HINT_AFTER) return;
  const hint = {
    text: `Minimal valid call: ${tool.minimalCall}`,
    type: "text" as const,
  };
  return { message: { ...message, content: [...message.content, hint] } };
}

export function installTools(pi: ExtensionAPI, rt: HarnessRuntime): void {
  const misses: Misses = new Map();
  for (const tool of GAME_TOOLS) tool.register(pi, rt);
  pi.on("tool_execution_end", (event) => countMiss(event, misses, rt));
  pi.on("message_end", (event) => hintMiss(event.message, misses));
}
