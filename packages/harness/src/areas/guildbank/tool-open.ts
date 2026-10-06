import { abortable } from "@peon/core/lib/abort";
import { type ObjectRow, objectRows } from "#harness/areas/objects/reads";
import type {
  GuildBankAfter,
  GuildBankArgs,
  GuildBankCtx,
} from "#harness/areas/guildbank/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export const GUILD_VAULT_TYPE = 34;
export const GUILD_VAULT_YARDS = 10;

export type VaultPick =
  | { found: true; guid: bigint }
  | { found: false; known: readonly ObjectRow[] };

export function pickVault(ctx: GuildBankCtx): VaultPick {
  const vaults = objectRows(ctx).filter((row) => row.type === GUILD_VAULT_TYPE);
  const near = vaults
    .filter((row) => row.distance !== undefined)
    .sort((left, right) => (left.distance ?? 0) - (right.distance ?? 0));
  const first = near[0];
  if (first && (first.distance ?? 11) <= GUILD_VAULT_YARDS)
    return { found: true, guid: first.guid };
  return { found: false, known: near };
}

export function noVaultText(
  known: readonly Pick<ObjectRow, "distance" | "name" | "x" | "y">[],
): string {
  if (known.length === 0)
    return "No guild vault is known nearby. Walk to a guild vault and call again.";
  const [nearest] = [...known].sort(
    (left, right) => (left.distance ?? 0) - (right.distance ?? 0),
  );
  if (nearest === undefined)
    return "No guild vault is known nearby. Walk to a guild vault and call again.";
  const at =
    nearest.x === undefined || nearest.y === undefined
      ? ""
      : ` at ${nearest.x}, ${nearest.y}`;
  const where =
    nearest.distance === undefined ? "" : ` (${nearest.distance} yd away)`;
  return (
    `No guild vault is close enough. The nearest known vault is ${nearest.name}${at}${where}. ` +
    "Walk to it with travel, then call again."
  );
}

function vaultRefusal(reason: string, detail: string): Refusal {
  return new Refusal({
    detail,
    next: nextCall("guildbank", { do: "open" }),
    reason,
  });
}

export function settledOf(
  outcome: { status: string; reason?: string },
  verb: string,
): void {
  if (outcome.status === "ok") return;
  if (outcome.status === "unanswered")
    throw vaultRefusal("no_answer", `The guild bank ${verb} went unanswered.`);
  if (outcome.status === "no_change")
    throw vaultRefusal("no_change", `The guild bank ${verb} changed nothing.`);
  throw vaultRefusal(
    "guildbank_refused",
    `The guild bank ${verb} was refused (${outcome.reason ?? "unknown"}).`,
  );
}

export function tabOf(args: GuildBankArgs): number {
  const tab = args.tab ?? 0;
  if (!Number.isInteger(tab) || tab < 0 || tab > 5)
    throw vaultRefusal(
      "bad_tab",
      `Tab ${String(args.tab)} is not a vault tab (0-5).`,
    );
  return tab;
}

export function afterOf(
  verb: GuildBankAfter["do"],
  tab: number,
  lines: string[] = [],
  money?: string,
): GuildBankAfter {
  return { do: verb, lines, money, tab };
}

async function openVault(ctx: GuildBankCtx): Promise<ToolResult<GuildBankAfter>> {
  const picked = pickVault(ctx);
  if (!picked.found) throw vaultRefusal("no_vault", noVaultText(picked.known));
  const act = ctx.handle.guildbank.act;
  const opened = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(act.openVault(picked.guid), ctx.signal);
  });
  settledOf(opened, "open");
  const state = ctx.handle.guildbank.state();
  const lines = [
    `The vault holds ${state.money} copper in ${state.tabs} tab${state.tabs === 1 ? "" : "s"}.`,
  ];
  return result("DONE", {
    after: afterOf("open", 0, lines, state.money.toString(10)),
    body: lines,
    detail: `Opened the guild vault (${state.tabs} tab${state.tabs === 1 ? "" : "s"}).`,
  });
}

export async function runOpen(ctx: GuildBankCtx): Promise<ToolResult<GuildBankAfter>> {
  return openVault(ctx);
}
