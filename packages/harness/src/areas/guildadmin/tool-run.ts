import type {
  GuildArgs,
  GuildAfter,
  GuildCtx,
  GuildDo,
} from "#harness/areas/guildadmin/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export function afterOf(verb: GuildDo, target?: string): GuildAfter {
  return { do: verb, target };
}

export function refuse(
  reason: string,
  detail: string,
  next = nextCall("guild", { do: "status" }),
): Refusal {
  return new Refusal({ detail, next, reason });
}

export function silent(verb: GuildDo, what: string): ToolResult<GuildAfter> {
  return result("UNCONFIRMED", {
    after: afterOf(verb),
    detail: `${what} got no answer. You may not be in a guild, or your rank lacks the right.`,
    next: nextCall("guild", { do: "status" }),
    reason: "no_reply",
  });
}

export function localRefusal(reason: string): Refusal {
  return refuse("refused", reason);
}

export function needText(args: GuildArgs, field: "name" | "text"): string {
  const value = args[field];
  if (value === undefined)
    throw refuse("missing_arg", `Give ${field} for this call.`);
  return value;
}

export type { GuildCtx };
