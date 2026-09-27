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
    detail: `${wroteText(texts)} Read it before you act.`,
    next: "end your turn and read the human's message.",
    reason: "human_waiting",
  });
}

export function admitAgent(rt: HarnessRuntime, tool: string): void {
  if (rt.session.humanWaiting) throw humanWaiting(rt.session.humanTexts);
  if (rt.control.claim("agent", tool).granted) return;
  throw new Refusal({
    detail: "the human is driving the character.",
    next: "end your turn and wait for the human to hand back.",
    reason: "human_driving",
  });
}
