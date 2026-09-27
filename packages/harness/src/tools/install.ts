import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  ExtensionAPI,
  MessageEndEventResult,
  ToolExecutionEndEvent,
} from "@earendil-works/pi-coding-agent";
import type { ToolName } from "#harness/contract/result";
import type { HarnessRuntime } from "#harness/contract/services";
import { nextCall } from "#harness/tools/define";
import { gameTools } from "#harness/tools/registry";
import { rendererFor } from "#harness/ui/renderers/registry";

const VALIDATION = 'Validation failed for tool "';
const HINT_AFTER = 2;
const MINIMAL_CALLS: Readonly<Record<ToolName, string>> = {
  engage: nextCall("engage"),
  interact: nextCall("interact", { npc: "u3" }),
  journal: nextCall("journal", { about: "quests" }),
  look: nextCall("look"),
  loot: nextCall("loot"),
  recover: nextCall("recover"),
  rest: nextCall("rest"),
  social: nextCall("social", { text: "hello" }),
  stop: nextCall("stop"),
  travel: nextCall("travel", { to: "explore" }),
};

type Misses = Map<ToolName, number>;

function isToolName(name: string): name is ToolName {
  return Object.hasOwn(MINIMAL_CALLS, name);
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
  const tool = event.toolName;
  if (!isToolName(tool)) return;
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
  if (
    message.role !== "toolResult" ||
    !message.isError ||
    !isToolName(message.toolName)
  )
    return;
  if ((misses.get(message.toolName) ?? 0) < HINT_AFTER) return;
  const hint = {
    text: `Minimal valid call: ${MINIMAL_CALLS[message.toolName]}`,
    type: "text" as const,
  };
  return { message: { ...message, content: [...message.content, hint] } };
}

export function installTools(pi: ExtensionAPI, rt: HarnessRuntime): void {
  const misses: Misses = new Map();
  for (const tool of gameTools(rt))
    pi.registerTool({
      ...tool,
      ...(isToolName(tool.name) ? rendererFor(tool.name) : {}),
    });
  pi.on("tool_execution_end", (event) => countMiss(event, misses, rt));
  pi.on("message_end", (event) => hintMiss(event.message, misses));
}
