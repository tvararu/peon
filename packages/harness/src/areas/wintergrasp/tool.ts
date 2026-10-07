import { type Static, Type } from "@earendil-works/pi-ai";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { AreaActsOf, AreaState } from "@peon/core";

type Acts = AreaActsOf<"wintergrasp">;
type State = AreaState<"wintergrasp">;

import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { nextCall } from "#harness/tools/next-call";
import { argText } from "#harness/ui/draw";
import {
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export const wintergraspParams = Type.Object({
  action: Type.Optional(
    Type.String({
      description:
        "accept or decline a pending Wintergrasp queue or war offer, or leave the queue. Calling leave while a war runs hearths out of the zone.",
    }),
  ),
});

export type WintergraspArgs = Static<typeof wintergraspParams>;
export type WintergraspAction = "accept" | "decline" | "leave";
export type WintergraspAfter = { action: WintergraspAction | undefined };
export type WintergraspCtx = ToolCtx<WintergraspAfter>;

function emptyWinter(action?: WintergraspAction): WintergraspAfter {
  return { action };
}

function winterRefusal(reason: string, detail: string, next?: string): Refusal {
  return new Refusal({
    detail,
    next: next ?? nextCall("wintergrasp"),
    reason,
  });
}

function pendingOffer(state: State): {
  kind: "queue" | "entry";
  battleId: number;
} {
  if (state.phase === "queue_offered" && state.battleId !== undefined)
    return { battleId: state.battleId, kind: "queue" };
  if (state.phase === "entry_offered" && state.battleId !== undefined)
    return { battleId: state.battleId, kind: "entry" };
  throw winterRefusal(
    "no_offer",
    "No Wintergrasp offer is pending.",
    "wait for the wintergrasp invitation.",
  );
}

type Answer = Awaited<ReturnType<Acts["answerQueue"]>>;

function answerDetail(answer: Answer): string {
  if (answer.status === "declined")
    return "You declined the Wintergrasp offer.";
  if (answer.status === "queued")
    return `You joined the Wintergrasp queue (battle ${answer.battleId}).`;
  if (answer.status === "entered")
    return `You entered the Wintergrasp battle (battle ${answer.battleId}).`;
  if (answer.status === "ejected")
    return `The Wintergrasp battle ejected you (${answer.reason}).`;
  if (answer.status === "left")
    return `You left the Wintergrasp queue (${answer.reason}).`;
  if (answer.status === "refused") return "The Wintergrasp offer refused you.";
  return "The Wintergrasp offer did not answer.";
}

async function runAcceptDecline(
  action: "accept" | "decline",
  ctx: WintergraspCtx,
): Promise<ToolResult<WintergraspAfter>> {
  const accept = action === "accept";
  const offer = pendingOffer(ctx.handle.wintergrasp.state());
  const answer = await ctx.rt.mutex.run(() =>
    offer.kind === "queue"
      ? ctx.handle.wintergrasp.act.answerQueue(accept)
      : ctx.handle.wintergrasp.act.answerEntry(accept),
  );
  const detail = answerDetail(answer);
  const noReply = answer.status === "no_reply";
  return result(noReply ? "REFUSED" : "DONE", {
    after: emptyWinter(action),
    detail,
    reason: noReply ? "no_reply" : undefined,
  });
}

async function runLeave(ctx: WintergraspCtx): Promise<ToolResult<WintergraspAfter>> {
  const state = ctx.handle.wintergrasp.state();
  if (state.phase === "at_war") return await runLeaveWar(ctx);
  if (state.phase !== "queue_offered" && state.phase !== "entry_offered")
    throw winterRefusal(
      "no_offer",
      "No Wintergrasp queue to leave.",
      "wait for the wintergrasp invitation.",
    );
  const answer = await ctx.rt.mutex.run(() =>
    ctx.handle.wintergrasp.act.exitQueue(),
  );
  return result(answer.status === "no_reply" ? "REFUSED" : "DONE", {
    after: emptyWinter("leave"),
    detail: answerDetail(answer),
    reason: answer.status === "no_reply" ? "no_reply" : undefined,
  });
}

async function runLeaveWar(
  ctx: WintergraspCtx,
): Promise<ToolResult<WintergraspAfter>> {
  const done = await ctx.rt.mutex.run(() =>
    ctx.handle.wintergrasp.act.hearthAndResurrect(),
  );
  if (done.status === "teleported")
    return result("DONE", {
      after: emptyWinter("leave"),
      detail: "You hearthed out of Wintergrasp.",
    });
  return result("REFUSED", {
    after: emptyWinter("leave"),
    detail: "The hearth out of Wintergrasp did not answer.",
    reason: "no_reply",
  });
}

export async function runWintergrasp(
  args: WintergraspArgs,
  ctx: WintergraspCtx,
): Promise<ToolResult<WintergraspAfter>> {
  const action = (args.action ?? "") as string;
  if (action === "accept" || action === "decline")
    return await runAcceptDecline(action, ctx);
  if (action === "leave") return await runLeave(ctx);
  throw winterRefusal(
    "unknown_action",
    `Unknown wintergrasp action ${action === "" ? "(none)" : action}. Use accept, decline or leave.`,
  );
}

function wintergraspCall(args: unknown, theme: Theme): string {
  return callLine({
    icon: "friendly",
    parts: [argText(args, "action") ?? "show"],
    theme,
    verb: "wintergrasp",
  });
}

export const wintergraspRenderers: ToolRenderers<
  "wintergrasp",
  WintergraspAfter
> = {
  renderCall: callRenderer(wintergraspCall),
  renderResult: resultRenderer("wintergrasp", ({ expanded, result: out }) =>
    expanded ? out.body : [],
  ),
};

export const wintergraspSpec: GameToolSpec<
  typeof wintergraspParams,
  "wintergrasp",
  WintergraspAfter
> = {
  allowStopped: () => false,
  fallback: () => emptyWinter(),
  kind: "action",
  minimalArgs: { action: "accept" },
  name: "wintergrasp",
  parameters: wintergraspParams,
  renderers: wintergraspRenderers,
  run: runWintergrasp,
  text: {
    description:
      "Accept or decline a pending Wintergrasp queue or war offer, leave the queue, or hearth out of the zone during a war. Never answers offers by itself.",
    guidelines: [
      "Call only while a wintergrasp invitation is pending; answer within the 20 second deadline.",
    ],
    label: "Wintergrasp",
  },
};

export const wintergraspTool = defineGameTool(wintergraspSpec);
