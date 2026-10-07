import { afterOf, refuse } from "#harness/areas/guildadmin/tool-run";
import type {
  GuildAfter,
  GuildArgs,
  GuildCtx,
} from "#harness/areas/guildadmin/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { parseRef } from "#harness/ops/refs";
import { knownUnits } from "#harness/ops/views";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

const CHARTER_ENTRIES: Record<string, number> = {
  "2v2": 23_560,
  "3v3": 23_561,
  "5v5": 23_562,
  guild: 5863,
};

const CHARTER_LABELS: Record<number, string> = {
  5863: "guild",
  23560: "2v2",
  23561: "3v3",
  23562: "5v5",
};

function charterNext(): string {
  return nextCall("guild", { do: "charter", step: "status" });
}

function charterRefusal(reason: string, detail: string, next?: string) {
  return refuse(reason, detail, next ?? charterNext());
}

function petitionerOf(args: GuildArgs, ctx: GuildCtx): bigint {
  if (args.npc !== undefined) {
    const guid = ctx.rt.refs.guidOf(args.npc);
    if (guid === undefined)
      throw charterRefusal(
        "unknown_ref",
        `${args.npc} is not a known ref.`,
        "look",
      );
    return guid;
  }
  const [nearest] = ctx.handle
    .queryNearby({ all: true })
    .filter((row) => !row.self && row.roles.includes("petitioner"))
    .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
  if (nearest) return nearest.entity.guid;
  throw charterRefusal(
    "no_petitioner",
    "No charter seller is known nearby. Walk to a guild master or an arena organizer in a capital city.",
    "look",
  );
}

function heldOf(args: GuildArgs, ctx: GuildCtx): bigint {
  const held = ctx.handle
    .getInventoryState()
    .slots.flatMap((slot) =>
      slot.status === "occupied" &&
      slot.item.entry !== undefined &&
      CHARTER_LABELS[slot.item.entry] !== undefined
        ? [{ entry: slot.item.entry, guid: slot.guid }]
        : [],
    );
  if (held.length === 0)
    throw charterRefusal(
      "no_charter",
      "You hold no charter. Buy one from a charter seller first.",
      nextCall("guild", { do: "charter", step: "buy" }),
    );
  const wanted = args.charter;
  const found =
    wanted === undefined
      ? held[0]
      : held.find((one) => one.entry === CHARTER_ENTRIES[wanted]);
  if (!found)
    throw charterRefusal("no_charter", `You hold no ${wanted} charter.`);
  if (wanted === undefined && held.length > 1)
    throw charterRefusal(
      "which_charter",
      `You hold ${held.length} charters (${held.map((one) => CHARTER_LABELS[one.entry]).join(", ")}). Give charter to pick one.`,
    );
  return found.guid;
}

function settled(
  what: string,
  out: { status: string; reason?: string },
): ToolResult<GuildAfter> | undefined {
  if (out.status === "refused")
    return result("REFUSED", {
      after: afterOf("charter"),
      detail: `${what} was refused (${out.reason}).`,
      next: charterNext(),
      reason: out.reason ?? "refused",
    });
  if (out.status === "no_reply")
    return result("UNCONFIRMED", {
      after: afterOf("charter"),
      detail: `${what} got no answer from the server.`,
      next: charterNext(),
      reason: "no_reply",
    });
  return undefined;
}

async function runBuy(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const name = args.name?.trim() ?? "";
  if (name === "")
    throw charterRefusal("missing_arg", "Give name, the charter name.");
  const kind = args.charter ?? "guild";
  const npc = petitionerOf(args, ctx);
  const ref = ctx.rt.refs.refOf(npc);
  const acts = ctx.handle.charters.act;
  const listed = await ctx.rt.mutex.run(() => acts.showList(npc));
  const noList = settled("The showlist", listed);
  if (noList) return noList;
  const entries =
    ctx.handle.charters.state().offers[`0x${npc.toString(16)}`] ?? [];
  const entry = entries.find((one) => one.entry === CHARTER_ENTRIES[kind]);
  if (!entry)
    throw charterRefusal(
      "not_offered",
      `${ref} does not sell a ${kind} charter. It sells: ${entries.map((one) => CHARTER_LABELS[one.entry] ?? one.entry).join(", ") || "nothing"}.`,
      "look",
    );
  const bought = await ctx.rt.mutex.run(() => acts.buy(npc, name, entry.index));
  const noBuy = settled("The purchase", bought);
  if (noBuy) return noBuy;
  return result("DONE", {
    after: afterOf("charter", ref),
    detail: `Bought a ${kind} charter named ${name} for ${entry.cost} copper. It needs ${entry.required} signatures from other players before you turn it in.`,
    next: nextCall("guild", { charter: kind, do: "charter", step: "status" }),
  });
}

async function runStatus(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const item = heldOf(args, ctx);
  const acts = ctx.handle.charters.act;
  const queried = await ctx.rt.mutex.run(() => acts.query(item));
  const noQuery = settled("The charter query", queried);
  if (noQuery) return noQuery;
  await ctx.rt.mutex.run(() => acts.showSignatures(item));
  const petition =
    ctx.handle.charters.state().petitions[`0x${item.toString(16)}`];
  if (!petition)
    return result("UNCONFIRMED", {
      after: afterOf("charter"),
      detail: "The charter query got no answer from the server.",
      next: charterNext(),
      reason: "no_reply",
    });
  const have = petition.signers.length;
  return result("DONE", {
    after: afterOf("charter", ctx.rt.refs.refOf(item)),
    detail: `The ${petition.kind} charter ${petition.name} has ${have} of ${petition.needed} signatures.`,
    next:
      have >= petition.needed
        ? nextCall("guild", { do: "charter", step: "turn_in" })
        : nextCall("guild", {
            do: "charter",
            name: "<player>",
            step: "offer",
          }),
  });
}

async function runOffer(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const wanted = args.name?.trim() ?? "";
  if (wanted === "")
    throw charterRefusal(
      "missing_arg",
      "Give name, the player to show the charter to.",
    );
  const item = heldOf(args, ctx);
  const found = parseRef(wanted)
    ? knownUnits(ctx).find((unit) => unit.ref === wanted)
    : knownUnits(ctx).find(
        (unit) => unit.name.toLowerCase() === wanted.toLowerCase(),
      );
  if (found?.kind !== "player")
    throw charterRefusal(
      "not_seen",
      `no player "${wanted}" is in view.`,
      nextCall("look"),
    );
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.charters.act.offer(item, BigInt(`0x${found.guid}`)),
  );
  const noOffer = settled("The offer", out);
  if (noOffer) return noOffer;
  return result("DONE", {
    after: afterOf("charter", wanted),
    detail: `Showed the charter to ${wanted}. They sign it with the sign verb.`,
    next: nextCall("guild", { do: "charter", step: "status" }),
  });
}

async function runRename(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const name = args.name?.trim() ?? "";
  if (name === "")
    throw charterRefusal("missing_arg", "Give name, the charter name.");
  const item = heldOf(args, ctx);
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.charters.act.rename(item, name),
  );
  const noRename = settled("The rename", out);
  if (noRename) return noRename;
  return result("DONE", {
    after: afterOf("charter", name),
    detail: `Renamed the charter to ${name}.`,
  });
}

async function runTurnIn(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const item = heldOf(args, ctx);
  const npc = petitionerOf(args, ctx);
  const ref = ctx.rt.refs.refOf(npc);
  const { background, border_color, border_style, color, style } = args;
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.charters.act.turnIn(
      item,
      background === undefined ||
        border_color === undefined ||
        border_style === undefined ||
        color === undefined ||
        style === undefined
        ? undefined
        : {
            background,
            border: border_style,
            borderColor: border_color,
            icon: style,
            iconColor: color,
          },
    ),
  );
  if (out.status === "refused")
    return result("REFUSED", {
      after: afterOf("charter", ref),
      detail: `The turn in was refused (${out.reason}). Give the five emblem numbers (style, color, border_style, border_color, background) to set an arena team emblem.`,
      next: charterNext(),
      reason: out.reason,
    });
  const noTurnIn = settled("The turn in", out);
  if (noTurnIn) return noTurnIn;
  return result("DONE", {
    after: afterOf("charter", ref),
    detail: "Turned in the charter.",
    next: nextCall("guild", { do: "status" }),
  });
}

export function runCharter(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const step = args.step;
  if (step === "buy") return runBuy(args, ctx);
  if (step === "status") return runStatus(args, ctx);
  if (step === "offer") return runOffer(args, ctx);
  if (step === "turn_in") return runTurnIn(args, ctx);
  if (step === "rename") return runRename(args, ctx);
  throw charterRefusal(
    "missing_arg",
    "Give step: buy, status, offer, turn_in or rename.",
  );
}

export async function runSign(
  _args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const offer = ctx.handle.charters.state().pendingOffer;
  if (!offer)
    throw charterRefusal(
      "no_offer",
      "Nobody has offered you a charter to sign.",
      "look",
    );
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.charters.act.sign(offer.item),
  );
  const noSign = settled("The signing", out);
  if (noSign) return noSign;
  return result("DONE", {
    after: afterOf("sign"),
    detail: "Signed the charter.",
  });
}

export async function runDecline(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  if (args.step !== "charter")
    throw charterRefusal(
      "missing_arg",
      "Give step: charter to decline a charter offer.",
    );
  const offer = ctx.handle.charters.state().pendingOffer;
  if (!offer)
    throw charterRefusal(
      "no_offer",
      "Nobody has offered you a charter to decline.",
      "look",
    );
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.charters.act.decline(offer.item),
  );
  if (out.status === "no_offer")
    throw charterRefusal(
      "no_offer",
      "Nobody has offered you a charter to decline.",
      "look",
    );
  return result("DONE", {
    after: afterOf("decline"),
    detail: "Declined the charter offer.",
  });
}
