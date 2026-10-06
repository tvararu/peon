import { afterOf, refuse, silent } from "#harness/areas/guildadmin/tool-run";
import type {
  GuildAfter,
  GuildCtx,
} from "#harness/areas/guildadmin/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { result } from "#harness/tools/define";

export async function runStatus(
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const info = await ctx.rt.mutex.run(() => ctx.handle.guildadmin.act.info());
  if ("status" in info)
    throw refuse("no_guild", "You are not in a guild.", "look");
  const roster = await ctx.rt.mutex.run(() => ctx.handle.requestGuildRoster());
  const body: string[] = [];
  if (roster) {
    for (const [index, name] of roster.rankNames.entries())
      if (name !== "") body.push(`rank ${index}: ${name}`);
    for (const member of roster.members)
      body.push(
        `member ${member.name} rank ${member.rankIndex}${member.publicNote ? ` note "${member.publicNote}"` : ""}${member.officerNote ? ` officer note "${member.officerNote}"` : ""}`,
      );
    if (roster.guildInfo !== "") body.push(`info text: ${roster.guildInfo}`);
  }
  return result("DONE", {
    after: afterOf("status", info.name),
    body,
    detail: `Guild ${info.name}: ${info.members} members.`,
  });
}

export async function runPermissions(
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.guildadmin.act.permissions(),
  );
  if (out.status !== "ok") return silent("permissions", "The rights query");
  const p = out.permissions;
  const gold = p.goldPerDay < 0 ? "unlimited" : `${p.goldPerDay} copper`;
  return result("DONE", {
    after: afterOf("permissions"),
    body: [
      `rank ${p.rank}, rights 0x${p.rights.toString(16)}`,
      `bank gold per day: ${gold}`,
      `bank tabs: ${p.tabCount}`,
    ],
    detail: `Your guild rank is ${p.rank}.`,
  });
}

const LOG_TYPES: Record<number, string> = {
  1: "invited",
  2: "joined",
  3: "promoted",
  4: "demoted",
  5: "removed",
  6: "left",
};

export async function runLog(ctx: GuildCtx): Promise<ToolResult<GuildAfter>> {
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.guildadmin.act.eventLog(),
  );
  if (out.status !== "ok") return silent("log", "The event log query");
  const body = out.entries.map((entry) => {
    const who = ctx.rt.refs.refOf(entry.player);
    const other =
      entry.other === undefined ? "" : ` ${ctx.rt.refs.refOf(entry.other)}`;
    const rank = entry.rank === undefined ? "" : ` to rank ${entry.rank}`;
    return `${entry.secondsAgo}s ago: ${who} ${LOG_TYPES[entry.type] ?? `type ${entry.type}`}${other}${rank}`;
  });
  return result("DONE", {
    after: afterOf("log"),
    body,
    detail: `The guild event log has ${body.length} entries.`,
  });
}
