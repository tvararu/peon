import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { AreaState } from "@peon/core";

type QueueState = AreaState<"battlegrounds">["queue"];
type MatchState = AreaState<"battlegrounds">["match"];

import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { parseRef } from "#harness/ops/refs";
import { Refusal } from "#harness/ops/refusal";
import { knownUnits } from "#harness/ops/views";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { nextCall } from "#harness/tools/next-call";
import { argText } from "#harness/ui/draw";
import {
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export const pvpParams = Type.Object({
  action: Type.Optional(
    Type.String({
      description: "For queue: join or leave. For flag: on or off.",
    }),
  ),
  bg: Type.Optional(
    StringEnum(
      ["warsong", "arathi", "alterac", "eye", "strand", "isle", "random"],
      {
        description: "For list and queue: the battleground. Default warsong.",
      },
    ),
  ),
  do: Type.Optional(
    StringEnum(
      [
        "list",
        "queue",
        "accept",
        "decline",
        "leave",
        "score",
        "flag",
        "report",
      ],
      {
        description:
          "list: read rewards. queue: join or leave a queue. accept/decline: answer an invitation. leave: leave a battleground or a queued slot. score: read the score and carriers. flag: set the PvP flag. report: report an away teammate. Default list.",
      },
    ),
  ),
  on: Type.Optional(
    Type.Boolean({
      description: "For flag: turn the PvP flag on or off.",
    }),
  ),
  slot: Type.Optional(
    Type.Number({
      description: "For accept, decline and leave: the queue slot. Default 0.",
    }),
  ),
  unit: Type.Optional(
    Type.String({
      description:
        'For report: the teammate, a name or ref like "u2" from look.',
    }),
  ),
});

export type PvpArgs = Static<typeof pvpParams>;
export type PvpDo =
  | "list"
  | "queue"
  | "accept"
  | "decline"
  | "leave"
  | "score"
  | "flag"
  | "report";
export type PvpAfter = { do: PvpDo };
export type PvpCtx = ToolCtx<PvpAfter>;

const BG_TYPES: Record<string, number> = {
  alterac: 1,
  arathi: 3,
  eye: 7,
  isle: 30,
  random: 32,
  strand: 9,
  warsong: 2,
};

function pvpRefusal(reason: string, detail: string, next?: string): Refusal {
  return new Refusal({ detail, next: next ?? nextCall("pvp"), reason });
}

function queueSlots(ctx: PvpCtx): QueueState["slots"] {
  return ctx.handle.battlegrounds.state().queue.slots;
}

function invitedSlot(ctx: PvpCtx, slot: number | undefined): number {
  if (slot !== undefined) return slot;
  const found = queueSlots(ctx).findIndex((one) => one.kind === "invited");
  if (found >= 0) return found;
  throw pvpRefusal("no_invitation", "No battleground invitation is waiting.");
}

function resolveTeammate(ctx: PvpCtx, wanted: string | undefined): bigint {
  const text = (wanted ?? "").trim();
  if (text === "")
    throw pvpRefusal(
      "missing_unit",
      "Name the teammate to report.",
      'call pvp with a player name or ref like "u2".',
    );
  const found = parseRef(text)
    ? knownUnits(ctx).find((unit) => unit.ref === text)
    : knownUnits(ctx).find(
        (unit) => unit.name.toLowerCase() === text.toLowerCase(),
      );
  if (!found)
    throw pvpRefusal(
      "not_seen",
      `no unit "${text}" is in view.`,
      nextCall("look"),
    );
  const match = ctx.handle.battlegrounds.state().match.current;
  if (match === undefined || !match.roster.includes(BigInt(`0x${found.guid}`)))
    throw pvpRefusal(
      "not_in_battleground",
      `${found.name} is not in your battleground.`,
    );
  return BigInt(`0x${found.guid}`);
}

async function runList(
  args: PvpArgs,
  ctx: PvpCtx,
): Promise<ToolResult<PvpAfter>> {
  const bg = BG_TYPES[args.bg ?? "warsong"] ?? 2;
  const list = await ctx.rt.mutex.run(() =>
    ctx.handle.battlegrounds.act.list(bg),
  );
  const instances =
    list.instances.length === 0
      ? "no open instances"
      : `${list.instances.length} open instances`;
  return result("DONE", {
    after: { do: "list" },
    body: [
      `Win ${list.rewards.winHonor} honor${list.rewards.winArena > 0 ? ` and ${list.rewards.winArena} arena points` : ""}; loss ${list.rewards.lossHonor} honor (${instances}).`,
    ],
    detail: `Warsong Gulch rewards read: ${instances}.`,
  });
}

async function runQueue(
  args: PvpArgs,
  ctx: PvpCtx,
): Promise<ToolResult<PvpAfter>> {
  const bg = BG_TYPES[args.bg ?? "warsong"] ?? 2;
  if ((args.action ?? "join") === "leave") {
    const slot = args.slot ?? 0;
    const left = await ctx.rt.mutex.run(() =>
      ctx.handle.battlegrounds.act.leaveQueue(slot),
    );
    return result("DONE", {
      after: { do: "queue" },
      detail: `You left the battleground queue in slot ${left.slot}.`,
    });
  }
  const joined = await ctx.rt.mutex.run(() =>
    ctx.handle.battlegrounds.act.join(bg),
  );
  const status = joined.status;
  const wait =
    status.kind === "queued"
      ? `, average wait ${Math.round(status.avgWaitMs / 60_000)} min`
      : "";
  return result("DONE", {
    after: { do: "queue" },
    detail: `Queued for Warsong Gulch, slot ${joined.slot}${wait}.`,
  });
}

async function runAnswer(
  args: PvpArgs,
  ctx: PvpCtx,
  accept: boolean,
): Promise<ToolResult<PvpAfter>> {
  const slot = invitedSlot(ctx, args.slot);
  if (queueSlots(ctx)[slot]?.kind !== "invited")
    return result("REFUSED", {
      after: { do: accept ? "accept" : "decline" },
      detail: `No battleground invitation waits in slot ${slot}.`,
      reason: "no_invitation",
    });
  const answered = await ctx.rt.mutex.run(() =>
    ctx.handle.battlegrounds.act.answer(slot, accept),
  );
  if (answered.kind === "active")
    return result("DONE", {
      after: { do: "accept" },
      detail: `You entered the battleground in slot ${slot}.`,
    });
  return result("DONE", {
    after: { do: "decline" },
    detail: `You declined the battleground invitation in slot ${slot}.`,
  });
}

async function runLeave(
  args: PvpArgs,
  ctx: PvpCtx,
): Promise<ToolResult<PvpAfter>> {
  const match: MatchState["current"] | undefined =
    ctx.handle.battlegrounds.state().match.current;
  if (match !== undefined) {
    await ctx.rt.mutex.run(() =>
      ctx.handle.battlegrounds.act.leaveBattleground(),
    );
    return result("DONE", {
      after: { do: "leave" },
      detail: "You left the battleground.",
    });
  }
  const slot = args.slot ?? 0;
  if (queueSlots(ctx)[slot]?.kind !== "queued")
    return result("REFUSED", {
      after: { do: "leave" },
      detail: `No battleground queue fills slot ${slot}.`,
      reason: "no_slot",
    });
  const left = await ctx.rt.mutex.run(() =>
    ctx.handle.battlegrounds.act.leaveQueue(slot),
  );
  return result("DONE", {
    after: { do: "leave" },
    detail: `You left the battleground queue in slot ${left.slot}.`,
  });
}

async function runScore(ctx: PvpCtx): Promise<ToolResult<PvpAfter>> {
  const score = await ctx.rt.mutex.run(() =>
    ctx.handle.battlegrounds.act.requestScore(),
  );
  const carriers = await ctx.rt.mutex.run(() =>
    ctx.handle.battlegrounds.act.requestCarriers(),
  );
  const head = score.ended
    ? `The match ended; winner team ${score.winner}.`
    : `The match runs with ${score.players.length} players on the board.`;
  const flags =
    carriers.carriers.length === 0
      ? "No flag carrier is out."
      : `${carriers.carriers.length} flag carriers are out.`;
  return result("DONE", {
    after: { do: "score" },
    body: [
      ...score.players
        .slice(0, 5)
        .map(
          (row) =>
            `${row.guid.toString(16)}: ${row.killingBlows} killing blows, ${row.damage} damage, ${row.healing} healing.`,
        ),
    ],
    detail: `${head} ${flags}`,
  });
}

async function runFlag(
  args: PvpArgs,
  ctx: PvpCtx,
): Promise<ToolResult<PvpAfter>> {
  const on = args.on ?? args.action === "on";
  await ctx.rt.mutex.run(() => ctx.handle.battlegrounds.act.setPvp(on));
  return result("DONE", {
    after: { do: "flag" },
    detail: on ? "PvP flag is on." : "PvP flag is off.",
  });
}

async function runReport(
  args: PvpArgs,
  ctx: PvpCtx,
): Promise<ToolResult<PvpAfter>> {
  const guid = resolveTeammate(ctx, args.unit);
  await ctx.rt.mutex.run(() => ctx.handle.battlegrounds.act.reportAfk(guid));
  return result("DONE", {
    after: { do: "report" },
    detail: "You reported the teammate away.",
  });
}

export async function runPvp(
  args: PvpArgs,
  ctx: PvpCtx,
): Promise<ToolResult<PvpAfter>> {
  const verb = (args.do ?? "list") as PvpDo;
  if (verb === "list") return runList(args, ctx);
  if (verb === "queue") return runQueue(args, ctx);
  if (verb === "accept") return runAnswer(args, ctx, true);
  if (verb === "decline") return runAnswer(args, ctx, false);
  if (verb === "leave") return runLeave(args, ctx);
  if (verb === "score") return runScore(ctx);
  if (verb === "flag") return runFlag(args, ctx);
  if (verb === "report") return runReport(args, ctx);
  throw pvpRefusal(
    "unknown_verb",
    `Unknown pvp verb ${String(verb)}. Use list, queue, accept, decline, leave, score, flag or report.`,
  );
}

function pvpCall(args: unknown, theme: Theme): string {
  return callLine({
    icon: "friendly",
    parts: [
      argText(args, "do") ?? "list",
      argText(args, "action"),
      argText(args, "bg"),
      argText(args, "slot"),
      argText(args, "unit"),
    ],
    theme,
    verb: "pvp",
  });
}

export const pvpRenderers: ToolRenderers<"pvp", PvpAfter> = {
  renderCall: callRenderer(pvpCall),
  renderResult: resultRenderer("pvp", ({ expanded, result: out }) =>
    expanded ? out.body : [],
  ),
};

export const pvpSpec: GameToolSpec<typeof pvpParams, "pvp", PvpAfter> = {
  allowStopped: (args) =>
    args.do === undefined || args.do === "list" || args.do === "score",
  fallback: () => ({ do: "list" }),
  kind: "action",
  minimalArgs: { do: "list" },
  name: "pvp",
  parameters: pvpParams,
  renderers: pvpRenderers,
  run: runPvp,
  text: {
    description:
      "List battlegrounds, join and leave their queues, answer invitations, read the score and set the PvP flag.",
    guidelines: [
      "Call list first so the battleground is known before queueing. Never accept an invitation unless asked.",
    ],
    label: "PvP",
  },
};
export const pvpTool = defineGameTool(pvpSpec);
