import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "#harness/contract/services";

export function installInput(pi: ExtensionAPI, rt: HarnessRuntime): void {
  const { session } = rt;
  pi.on("agent_start", () => {
    Object.assign(session, {
      agent: "streaming",
      turnStartSeq: rt.log.lastSeq(),
      turnToolCalls: 0,
    });
  });
  pi.on("turn_start", () => {
    session.humanWaiting = false;
  });
  pi.on("tool_execution_start", (event) => {
    Object.assign(session, {
      agent: "tool",
      lastToolCallAt: rt.clock.now(),
      tool: event.toolName,
    });
  });
  pi.on("tool_execution_end", () => {
    Object.assign(session, { agent: "streaming", tool: undefined });
  });
  pi.on("agent_end", () => {
    Object.assign(session, { agent: "idle", tool: undefined });
  });
  pi.on("message_end", (event) => noteAssistant(rt, event.message));
}

function noteAssistant(rt: HarnessRuntime, message: AgentMessage): void {
  if (!("role" in message) || message.role !== "assistant") return;
  const text = message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  if (text.trim().length === 0) return;
  rt.log.append({
    class: "log",
    data: { text },
    domain: "agent",
    event: "agent/message",
    text,
  });
}
