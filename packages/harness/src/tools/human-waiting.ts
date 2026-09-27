import { Refusal } from "#harness/ops/refusal";

const QUOTE_MAX = 200;

function wroteText(text: string | undefined): string {
  if (text === undefined) return "the human wrote a message.";
  const flat = text.replace(/\s+/g, " ").trim();
  const cut = flat.length > QUOTE_MAX ? `${flat.slice(0, QUOTE_MAX)}...` : flat;
  return `the human wrote: "${cut}"`;
}

export function humanWaiting(text: string | undefined): Refusal {
  return new Refusal({
    detail: `${wroteText(text)} Read it before you act.`,
    next: "end your turn and read the human's message.",
    reason: "human_waiting",
  });
}
