import { knownSpell, type SpellRef } from "#harness/areas/spells/book";
import type {
  SpellAfter,
  SpellArgs,
  SpellCtx,
} from "#harness/areas/spells/tool";
import { type Heard, hearCasts } from "#harness/areas/spells/tool-wait";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { settle } from "#harness/ops/settle";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

const REPLY_MARGIN_MS = 3000;
const CODE = /^[a-z][a-z_]*$/;

type Reply = { done: true } | { done: false; reason: string };
type Target = { guid: bigint; label: string; text: string | undefined };

class CastRejected extends Error {
  readonly code: string;

  constructor(code: string, options: ErrorOptions) {
    super(code, options);
    this.code = code;
  }
}

export async function spellOf(
  ctx: SpellCtx,
  text: string | undefined,
): Promise<SpellRef> {
  if (text === undefined || text.trim() === "")
    throw new Refusal({
      detail: "name the spell to use.",
      next: nextCall("journal", { about: "spells" }),
      reason: "missing_spell",
    });
  const spell = await knownSpell(ctx.handle, text);
  if (spell) return spell;
  throw new Refusal({
    detail: `you do not know a spell "${text.trim()}".`,
    next: nextCall("journal", { about: "spells" }),
    reason: "unknown_spell",
  });
}

function targetOf(ctx: SpellCtx, text: string | undefined): Target {
  const wanted = text?.trim() ?? "";
  if (wanted === "" || wanted.toLowerCase() === "self")
    return {
      guid: ctx.handle.getControlState().selfGuid,
      label: "yourself",
      text: undefined,
    };
  const resolved = resolveUnit(ctx, { text: wanted });
  if (resolved.kind !== "unit")
    throw unitRefusal({ param: "target", resolved, tool: "spell" });
  return {
    guid: resolved.guid,
    label: `${resolved.unit.name} (${resolved.unit.ref})`,
    text: resolved.unit.ref,
  };
}

function replyOf(event: Heard, spellId: number): Reply | undefined {
  if ("area" in event) {
    const { event: inner } = event;
    const started =
      event.area === "spells" &&
      inner.type === "channel_start" &&
      inner.spellId === spellId;
    return started ? { done: true } : undefined;
  }
  const outcome = event.state.lastOutcome;
  if (outcome?.kind !== "cast" || outcome.spellId !== spellId) return undefined;
  if (event.type === "cast_succeeded") return { done: true };
  if (event.type === "cast_failed" || event.type === "cast_interrupted")
    return { done: false, reason: outcome.reason ?? "failed" };
  return undefined;
}

function codeOf(error: unknown): string | undefined {
  return error instanceof Error && CODE.test(error.message)
    ? error.message
    : undefined;
}

async function sendAndWait(
  ctx: SpellCtx,
  spell: SpellRef,
  target: Target,
): Promise<Reply | undefined> {
  const { handle, rt, signal } = ctx;
  const castMs = handle.spellDefinition(spell.id)?.castTime?.castTimeMs ?? 0;
  const heard = await settle<Heard>({
    match: (event) => replyOf(event, spell.id) !== undefined,
    send: () =>
      rt.mutex.run(() => {
        try {
          handle.cast(spell.id, target.guid);
        } catch (error) {
          const code = codeOf(error);
          if (code === undefined) throw error;
          throw new CastRejected(code, { cause: error });
        }
      }),
    signal,
    subscribe: hearCasts(handle),
    timeoutMs: Math.max(0, castMs) + REPLY_MARGIN_MS,
  });
  return heard && replyOf(heard, spell.id);
}

export async function castFlow(
  args: SpellArgs,
  ctx: SpellCtx,
): Promise<ToolResult<SpellAfter>> {
  const spell = await spellOf(ctx, args.spell);
  const target = targetOf(ctx, args.target);
  const after: SpellAfter = {
    do: "cast",
    slot: undefined,
    spell,
    target: target.text,
  };
  const what = `${spell.name} on ${target.label}`;
  let reply: Reply | undefined;
  try {
    reply = await sendAndWait(ctx, spell, target);
  } catch (error) {
    if (!(error instanceof CastRejected)) throw error;
    return result("FAILED", {
      after,
      detail: `${what} was not sent: ${error.code}.`,
      reason: error.code,
    });
  }
  if (reply?.done) return result("DONE", { after, detail: `Cast ${what}.` });
  if (reply)
    return result("FAILED", {
      after,
      detail: `${what} failed: ${reply.reason}.`,
      reason: reply.reason,
    });
  return result("UNCONFIRMED", {
    after,
    detail: `The server did not answer the cast of ${what}.`,
    next: nextCall("journal", { about: "log" }),
    reason: "no_reply",
  });
}
