import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  getCurrentSystemMessage,
  type SystemMessage,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ToolName } from "#harness/contract/result";
import type { HarnessRuntime } from "#harness/contract/services";
import type { InWorld } from "#harness/contract/views";
import { TOOL_TEXT } from "#harness/prompt/guidelines";
import {
  buildSystemPrompt,
  type PromptInit,
} from "#harness/prompt/system-prompt";

const TOOL_ORDER: readonly ToolName[] = [
  "look",
  "travel",
  "engage",
  "loot",
  "interact",
  "rest",
  "recover",
  "social",
  "journal",
  "stop",
];

function known(value: string): string | undefined {
  return value === "" || value === "unknown" ? undefined : value;
}

function fromWorld(world: InWorld): PromptInit {
  const level = world.level > 0 ? world.level : undefined;
  return {
    character: world.char,
    className: known(world.className),
    level,
    race: known(world.race),
  };
}

function promptInit(rt: HarnessRuntime): PromptInit {
  const world = rt.ready.inWorld();
  if (world) return fromWorld(world);
  return {
    character: rt.profile.character,
    className: undefined,
    level: undefined,
    race: undefined,
  };
}

function toolNotes(): string {
  const lines = TOOL_ORDER.flatMap((tool) =>
    TOOL_TEXT[tool].guidelines.map((line) => `- ${tool}: ${line}`),
  );
  return `Tool notes:\n${lines.join("\n")}`;
}

function lunaPrompt(rt: HarnessRuntime): string {
  return `${buildSystemPrompt(promptInit(rt))}\n\n${toolNotes()}`;
}

function withPrompt(
  messages: AgentMessage[],
  prompt: string,
  now: number,
): AgentMessage[] {
  const current = getCurrentSystemMessage(messages);
  const tools = current?.toolsAdded ? { toolsAdded: current.toolsAdded } : {};
  const head: SystemMessage = {
    content: prompt,
    role: "system",
    timestamp: current?.timestamp ?? now,
    ...tools,
  };
  return [head, ...messages.filter((message) => message.role !== "system")];
}

export function installPrompt(pi: ExtensionAPI, rt: HarnessRuntime): void {
  pi.on("before_agent_start", () => ({ systemPrompt: lunaPrompt(rt) }));
  pi.on("context_with_system", (event) => ({
    messages: withPrompt(event.messages, lunaPrompt(rt), rt.clock.now()),
  }));
}
