import type { HarnessRuntime } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";

const QUOTE_MAX = 200;

function quote(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return `"${flat.length > QUOTE_MAX ? `${flat.slice(0, QUOTE_MAX)}...` : flat}"`;
}

function wroteText(texts: readonly string[]): string {
  if (texts.length === 0) return "the human wrote a message.";
  if (texts.length === 1)
    return `the human wrote: ${texts.map(quote).join("")}`;
  return `the human wrote ${texts.length} messages: ${texts.map(quote).join(", then ")}`;
}

function humanWaiting(texts: readonly string[]): Refusal {
  return new Refusal({
    detail: `${wroteText(texts)} Answer it before you act.`,
    next: "reply to the human now in plain text, as an agent message and not a tool call such as social, then act.",
    reason: "human_waiting",
  });
}

export function admitAgent(rt: HarnessRuntime, tool: string): void {
  if (rt.session.humanWaiting) throw humanWaiting(rt.session.humanTexts);
  const { control, session } = rt;
  const holder = control.owner();
  if (holder === "loop") return;
  if (session.agentGrant && control.holds(session.agentGrant)) return;
  const claim = holder === "human" ? undefined : control.claim("agent", tool);
  if (claim?.granted) {
    session.agentGrant = claim.grant;
    return;
  }
  throw new Refusal({
    detail: "the human is driving the character.",
    next: "end your turn and wait for the human to hand back.",
    reason: "human_driving",
  });
}
