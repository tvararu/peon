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
  let sent: "ready_check" | "dead" | { closest: string[] } | undefined;
  const echo = await settle<Extract<EmoteEvent, { type: "text_emote" }>>({
    match: () => true,
    send: () =>
      sendEmote(handle, what, guid).then((miss) => {
        sent = miss;
      }),
    signal,
    subscribe: (cb) => subscribeEcho(handle, cb),
    timeoutMs: EMOTE_SETTLE_MS,
  });
  signal?.throwIfAborted();
  if (echo !== undefined) {
    const { detail, to } = emotedDetail(what, name);
    return result("DONE", { after: { ...after(true), to }, detail });
  }
  if (sent === undefined)
    return result("UNCONFIRMED", {
      after: after(false),
      detail: `emoted ${what}; no echo in 2 s.`,
      next: nextCall("journal", { about: "log", since: "1m" }),
      reason: "no_answer",
    });
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
): Promise<undefined | "ready_check" | "dead" | { closest: string[] }> {
  const outcome = await handle.emotes.act.textEmote(what, guid);
  if (outcome.ok) return undefined;
  if (outcome.reason === "unknown_emote") return { closest: outcome.closest };
  if (outcome.reason === "cancelled")
    throw new Refusal({
      detail: "the emote send was cancelled.",
      next: nextCall("social", { do: "emote", what }),
      reason: "cancelled",
    });
  return outcome.reason;
}
