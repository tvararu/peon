import { afterOf, refuse, silent } from "#harness/areas/guildadmin/tool-run";
import type {
  GuildAfter,
  GuildArgs,
  GuildCtx,
} from "#harness/areas/guildadmin/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

const EMBLEM_FIELDS = [
  "style",
  "color",
  "border_style",
  "border_color",
  "background",
] as const;

function designerOf(args: GuildArgs, ctx: GuildCtx): bigint {
  if (args.npc !== undefined) {
    const guid = ctx.rt.refs.guidOf(args.npc);
    if (guid === undefined)
      throw refuse("unknown_ref", `${args.npc} is not a known ref.`, "look");
    return guid;
  }
  const [nearest] = ctx.handle
    .queryNearby({ all: true })
    .filter((row) => !row.self && row.roles.includes("tabard_designer"))
    .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
  if (nearest) return nearest.entity.guid;
  throw refuse(
    "no_designer",
    "No tabard designer is known nearby. Walk to the guild master in a capital city.",
    "look",
  );
}

export async function runTabard(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const npc = designerOf(args, ctx);
  const ref = ctx.rt.refs.refOf(npc);
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.guildadmin.act.openTabardVendor(npc),
  );
  if (out.status !== "opened") return silent("tabard", "The tabard designer");
  return result("DONE", {
    after: afterOf("tabard", ref),
    detail: `Opened the tabard designer ${ref}.`,
    next: nextCall("guild", { confirm: true, do: "emblem", npc: ref }),
  });
}

const EMBLEM_FAILURES: Record<number, string> = {
  1: "the emblem colors are invalid.",
  2: "you are not in a guild.",
  3: "only the guild leader can save an emblem.",
  4: "you need 10 gold.",
  5: "that is not a tabard designer, or it is too far away.",
};

export async function runEmblem(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  for (const field of EMBLEM_FIELDS)
    if (args[field] === undefined)
      throw refuse("missing_arg", `Give ${field} for the emblem.`);
  if (args.confirm !== true)
    throw refuse(
      "needs_confirm",
      "Saving an emblem costs 10 gold; pass confirm: true.",
    );
  const npc = designerOf(args, ctx);
  const ref = ctx.rt.refs.refOf(npc);
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.guildadmin.act.saveEmblem(npc, {
      backgroundColor: args.background ?? 0,
      borderColor: args.border_color ?? 0,
      borderStyle: args.border_style ?? 0,
      color: args.color ?? 0,
      style: args.style ?? 0,
    }),
  );
  if (out.status === "saved")
    return result("DONE", {
      after: afterOf("emblem", ref),
      detail: "Saved the guild emblem for 10 gold.",
    });
  if (out.status === "failed")
    return result("REFUSED", {
      after: afterOf("emblem", ref),
      detail: `The emblem was not saved: ${EMBLEM_FAILURES[out.code] ?? `code ${out.code}`}`,
      reason: `emblem_${out.code}`,
    });
  return silent("emblem", "The emblem save");
}
