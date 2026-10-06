import {
  afterOf,
  needText,
  refuse,
  silent,
} from "#harness/areas/guildadmin/tool-run";
import type {
  GuildAfter,
  GuildArgs,
  GuildCtx,
} from "#harness/areas/guildadmin/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

type Outcome = { status: string; reason?: string };

function refused(verb: GuildAfter["do"], out: Outcome): ToolResult<GuildAfter> {
  return result("REFUSED", {
    after: afterOf(verb),
    detail: out.reason ?? "the call was refused.",
    next: nextCall("guild", { do: "status" }),
    reason: "refused",
  });
}

async function rename(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const name = needText(args, "name");
  if (args.rank === undefined)
    throw refuse("missing_arg", "Give rank, the rank number from status.");
  const rankId = args.rank;
  await ctx.rt.mutex.run(() => ctx.handle.requestGuildRoster());
  const known = ctx.handle.guildadmin.state().roster?.ranks[rankId];
  if (known === undefined)
    throw refuse("no_such_rank", `The guild has no rank ${rankId}.`);
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.guildadmin.act.setRank(rankId, {
      goldPerDay: known.goldPerDay,
      name,
      rights: known.rights,
      tabs: known.tabs,
    }),
  );
  if (out.status === "updated")
    return result("DONE", {
      after: afterOf("rank", name),
      detail: `Rank ${out.rank} is now ${out.name}.`,
    });
  if (out.status === "denied")
    return result("REFUSED", {
      after: afterOf("rank", name),
      detail: "Only the guild leader can change ranks.",
      reason: "not_leader",
    });
  if (out.status === "refused") return refused("rank", out);
  return silent("rank", "The rank change");
}

export async function runRank(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const step = args.step;
  if (step === undefined)
    throw refuse("missing_arg", "Give step: add, rename or remove.");
  if (step === "rename") return await rename(args, ctx);
  if (step === "add") {
    const name = needText(args, "name");
    const out = await ctx.rt.mutex.run(() =>
      ctx.handle.guildadmin.act.addRank(name),
    );
    if (out.status === "updated")
      return result("DONE", {
        after: afterOf("rank", name),
        detail: `Added rank ${out.rank} ${out.name}; the guild has ${out.count} ranks.`,
      });
    if (out.status === "refused") return refused("rank", out);
    return silent("rank", "Adding the rank");
  }
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.guildadmin.act.removeLowestRank({
      confirm: args.confirm === true,
    }),
  );
  if (out.status === "removed")
    return result("DONE", {
      after: afterOf("rank"),
      detail: `Removed the lowest rank; the guild has ${out.count} ranks.`,
    });
  if (out.status === "refused") return refused("rank", out);
  return silent("rank", "Removing the rank");
}

export async function runNote(
  args: GuildArgs,
  ctx: GuildCtx,
  officer: boolean,
): Promise<ToolResult<GuildAfter>> {
  const verb = officer ? "officer_note" : "note";
  const name = needText(args, "name");
  const text = args.text ?? "";
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.guildadmin.act.setNote(name, text, { officer }),
  );
  if (out.status === "set")
    return result("DONE", {
      after: afterOf(verb, name),
      detail: `Set the ${officer ? "officer" : "public"} note of ${name}.`,
    });
  if (out.status === "denied")
    return result("REFUSED", {
      after: afterOf(verb, name),
      detail: "Your rank may not edit that note.",
      reason: "no_right",
    });
  if (out.status === "refused") return refused(verb, out);
  return silent(verb, "The note change");
}

export async function runInfoText(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const text = needText(args, "text");
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.guildadmin.act.setInfoText(text),
  );
  if (out.status === "set")
    return result("DONE", {
      after: afterOf("info_text"),
      detail: "Set the guild info text.",
    });
  if (out.status === "rejected")
    return result("REFUSED", {
      after: afterOf("info_text"),
      detail:
        "The server kept the old info text; your rank may lack the right.",
      reason: "no_right",
    });
  if (out.status === "refused") return refused("info_text", out);
  return silent("info_text", "The info text change");
}

export async function runDisband(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.guildadmin.act.disband({ confirm: args.confirm === true }),
  );
  if (out.status === "disbanded")
    return result("DONE", {
      after: afterOf("disband"),
      detail: "The guild is disbanded.",
    });
  if (out.status === "refused")
    throw refuse("needs_confirm", "Disbanding needs confirm: true.");
  return silent("disband", "The disband");
}
