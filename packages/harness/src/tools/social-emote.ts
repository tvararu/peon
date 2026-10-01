import type { AreaEventOf, Unsubscribe } from "@peon/core";
import type { SocialAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { type Resolved, resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { settle } from "#harness/ops/settle";
import { result } from "#harness/tools/define";
import { askHuman, nextCall } from "#harness/tools/next-call";

type EmoteEvent = AreaEventOf<"emotes">;
type EmoteCtx = ToolCtx<SocialAfter>;
type Handle = EmoteCtx["handle"];
type Echo = Extract<EmoteEvent, { type: "text_emote" }>;
export type EmoteRequest = { what: string; to: string | undefined };

export const EMOTE_SETTLE_MS = 2000;

export function emoteTarget(
  ctx: EmoteCtx,
  to: string | undefined,
): { guid: bigint | undefined; name: string | undefined } {
  if (to === undefined) return { guid: undefined, name: undefined };
  const resolved: Resolved = resolveUnit(ctx, { text: to });
  if (resolved.kind !== "unit")
    throw unitRefusal({ param: "to", resolved, tool: "social" });
  return { guid: resolved.guid, name: resolved.unit.name };
}

function subscribeEcho(
  handle: Handle,
  cb: (event: Extract<EmoteEvent, { type: "text_emote" }>) => void,
): Unsubscribe {
  const off = handle.emotes.onEvent((event: EmoteEvent) => {
    if (event.type === "text_emote" && event.self) cb(event);
  });
  return off;
}

function emotedDetail(
  what: string,
  name: string | undefined,
): { detail: string; to: string | undefined } {
  return name === undefined
    ? { detail: `emoted ${what} (echo confirmed)`, to: undefined }
    : { detail: `emoted ${what} at ${name} (echo confirmed)`, to: name };
}

export async function emoteStep(
  request: EmoteRequest,
  ctx: EmoteCtx,
): Promise<ToolResult<SocialAfter>> {
  const { handle, signal } = ctx;
  const what = request.what.trim();
  if (what.length === 0) {
    throw new Refusal({
      detail: "emote needs the emote name in what.",
      next: nextCall("social", { do: "emote", what: "wave" }),
      reason: "missing_emote",
    });
  }
  const { guid, name } = emoteTarget(ctx, request.to);
  const after = (confirmed: boolean): SocialAfter => ({
    action: "emote",
    confirmed,
    systemLine: undefined,
    text: what,
    to: name,
  });
  const seen: Echo[] = [];
  const isOurs = (event: Echo, id: number | undefined): boolean =>
    id !== undefined &&
    event.textEmote === id &&
    (event.target ?? undefined) === (name ?? undefined);
  const match = (event: Echo): boolean => {
    seen.push(event);
    return isOurs(event, textEmote);
  };
  let textEmote: number | undefined;
  const off = subscribeEcho(handle, match);
  signal?.throwIfAborted();
  const miss = await sendEmote(handle, what, guid, signal).catch((error) => {
    off();
    throw error;
  });
  const sent = miss.sent;
  textEmote = miss.textEmote;
  const echo =
    seen.find((event) => isOurs(event, textEmote)) ??
    (await settle<Echo>({
      match,
      signal,
      subscribe: (cb) => subscribeEcho(handle, cb),
      timeoutMs: EMOTE_SETTLE_MS,
    }));
  off();
  signal?.throwIfAborted();
  if (echo !== undefined) {
    const { detail, to } = emotedDetail(what, echo.target ?? name);
    return result("DONE", { after: { ...after(true), to }, detail });
  }
  if (sent === undefined) {
    return result("UNCONFIRMED", {
      after: after(false),
      detail: `emoted ${what}; no echo in 2 s.`,
      next: nextCall("journal", { about: "log", since: "1m" }),
      reason: "no_answer",
    });
  }
  return refusedResult(what, after(false), sent);
}

function refusedResult(
  what: string,
  after: SocialAfter,
  sent: "ready_check" | "dead" | { closest: string[] },
): ToolResult<SocialAfter> {
  if (sent === "ready_check")
    return result("REFUSED", {
      after,
      detail: "the ready check answers emotes; use group play instead.",
      next: nextCall("group", { do: "ready" }),
      reason: "ready_check",
    });
  if (sent === "dead")
    return result("REFUSED", {
      after,
      detail: "the character is dead; emotes need a living character.",
      next: askHuman("I am dead. What should I do?"),
      reason: "dead",
    });
  return result("REFUSED", {
    after,
    body: sent.closest,
    detail: `unknown emote "${what}".`,
    next: nextCall("social", {
      do: "emote",
      what: sent.closest.at(0) ?? "wave",
    }),
    reason: "unknown_emote",
  });
}

async function sendEmote(
  handle: Handle,
  what: string,
  guid: bigint | undefined,
  signal: AbortSignal | undefined,
): Promise<{
  sent: undefined | "ready_check" | "dead" | { closest: string[] };
  textEmote: number | undefined;
}> {
  const outcome = await handle.emotes.act.textEmote(what, guid, signal);
  if (outcome.ok) return { sent: undefined, textEmote: outcome.textEmote };
  if (outcome.reason === "unknown_emote")
    return { sent: { closest: outcome.closest }, textEmote: undefined };
  if (outcome.reason === "cancelled")
    throw new Refusal({
      detail: "the emote send was cancelled.",
      next: nextCall("social", { do: "emote", what }),
      reason: "cancelled",
    });
  return { sent: outcome.reason, textEmote: undefined };
}
