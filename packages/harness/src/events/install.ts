import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { HarnessRuntime } from "#harness/contract/services";
import { linkSession } from "#harness/eval/run-dir";
import {
  createDelivery,
  type Delivery,
  formatWake,
} from "#harness/events/delivery";
import { createStuckWatch } from "#harness/events/guard";
import { formatNow, nowClock } from "#harness/events/now";
import { nowSnapshot } from "#harness/ops/views";

export const NOW_DISPLAY = false;

export type NowMessage = {
  content: string;
  customType: "wow-now";
  display: boolean;
};

type StartInit = {
  ctx: ExtensionContext;
  delivery: Delivery;
  pi: ExtensionAPI;
  reason: string;
  rt: HarnessRuntime;
};

export function nowMessage(content: string): NowMessage {
  return { content, customType: "wow-now", display: NOW_DISPLAY };
}

export function nowText(rt: HarnessRuntime): string {
  const snapshot = nowSnapshot(rt);
  if (snapshot) return formatNow(snapshot);
  const why = rt.handle()
    ? "the world is still loading."
    : "the game connection is down.";
  return `[now ${nowClock(rt.clock.now())}] ${why}`;
}

function currentNow(rt: HarnessRuntime, delivery: Delivery): string {
  const line = nowText(rt);
  const passive = delivery.takePassive();
  const content =
    passive.length > 0
      ? `${line}\n${formatWake(passive, rt.clock.now())}`
      : line;
  const [first = line] = line.split("\n");
  rt.session.lastNow = content;
  rt.log.append({
    class: "log",
    data: { text: content },
    domain: "agent",
    event: "agent/now",
    text: first,
  });
  return content;
}

async function onSessionStart({
  ctx,
  delivery,
  pi,
  reason,
  rt,
}: StartInit): Promise<void> {
  const file = ctx.sessionManager.getSessionFile();
  if (file) await linkSession(rt.paths, file).catch(ignoreFailure);
  if (reason === "resume")
    pi.sendMessage(nowMessage(currentNow(rt, delivery)), {
      triggerTurn: false,
    });
}

function perCallNow(rt: HarnessRuntime): AgentMessage {
  return { content: nowText(rt), role: "user", timestamp: rt.clock.now() };
}

type Tail = { customType?: string; details?: { kind?: string }; role?: string };

function endsWithWake(messages: readonly AgentMessage[]): boolean {
  const last = messages.at(-1) as Tail | undefined;
  return (
    last?.role === "custom" &&
    last.customType === "wow-event" &&
    last.details?.kind === "wake"
  );
}

function wakeNow(rt: HarnessRuntime): AgentMessage {
  const content = nowText(rt);
  const [first = content] = content.split("\n");
  rt.session.lastNow = content;
  rt.log.append({
    class: "log",
    data: { text: content },
    domain: "agent",
    event: "agent/now",
    text: first,
  });
  return {
    content,
    customType: "wow-now",
    display: NOW_DISPLAY,
    role: "custom",
    timestamp: rt.clock.now(),
  };
}

function contextNow(
  rt: HarnessRuntime,
  messages: AgentMessage[],
): { messages: AgentMessage[] } | undefined {
  if (endsWithWake(messages)) return { messages: [...messages, wakeNow(rt)] };
  if (rt.flags.nowPerCall) return { messages: [...messages, perCallNow(rt)] };
  return undefined;
}

export function installEvents(pi: ExtensionAPI, rt: HarnessRuntime): void {
  const delivery = createDelivery({ pi, rt });
  const stuck = createStuckWatch({ rt });
  rt.router.setSink(delivery);
  stuck.start();
  pi.on("before_agent_start", () => ({
    message: nowMessage(currentNow(rt, delivery)),
  }));
  pi.on("session_start", (event, ctx) =>
    onSessionStart({ ctx, delivery, pi, reason: event.reason, rt }),
  );
  pi.on("agent_end", () => delivery.flush());
  pi.on("session_shutdown", () => stuck.stop());
  pi.on("context", (event) => contextNow(rt, event.messages));
}
