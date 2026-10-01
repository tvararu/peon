import { messageOf } from "@peon/core/lib/errors";
import {
  dismountFirst,
  withDismountedFirst,
} from "#harness/areas/selfstate/dismount-first";
import type { EngageAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { RunControl, RunEnd, RunStatus } from "#harness/contract/runs";
import type { OpsCtx, ToolCtx, ViewCtx } from "#harness/contract/services";
import { watchInterrupts } from "#harness/ops/danger";
import { completeQuestIds, noteQuestsDone } from "#harness/ops/quest-memory";
import { Refusal } from "#harness/ops/refusal";
import { manaText, poseView, vitalsView } from "#harness/ops/views";
import { awaitRun } from "#harness/runs/wait";
import { defineGameTool, emptyVitals, result } from "#harness/tools/define";
import {
  checkHelper,
  chooseTarget,
  type FightRun,
  guardPull,
  parseQuest,
} from "#harness/tools/engage-choose";
import { fight } from "#harness/tools/engage-fight";
import type { GameToolSpec } from "#harness/tools/game-tool";
import { nextCall } from "#harness/tools/next-call";
import { type EngageArgs, engageParams } from "#harness/tools/params-engage";
import { engageRenderers } from "#harness/ui/renderers/live-run";

type Report = ToolResult<EngageAfter>;
type Latest = { after: EngageAfter };

const FIGHT: FightRun = fight;
const HUMAN_WROTE = "The human wrote a message. Read it before you act.";

export function emptyEngage(): EngageAfter {
  return {
    cast: undefined,
    castErrors: [],
    copper: 0,
    current: undefined,
    decisions: [],
    how: "",
    kills: 0,
    loot: [],
    mode: "single",
    questId: undefined,
    self: emptyVitals(),
    swingErrors: [],
    targets: [],
    timeouts: 0,
    wanted: 1,
    xp: 0,
  };
}

function youLine(ctx: ViewCtx): string {
  const vitals = vitalsView(ctx);
  const pose = poseView(ctx);
  const mana = manaText(vitals);
  return `You: HP ${vitals.hp}/${vitals.maxHp}${mana ? `, ${mana}` : ""}${pose ? `, at ${Math.round(pose.x)}, ${Math.round(pose.y)}` : ""}.`;
}

function refusalReport(refusal: Refusal, after: EngageAfter): Report {
  return result(refusal.status, {
    after,
    body: refusal.body,
    detail: refusal.detail,
    next: refusal.next,
    options: refusal.options,
    reason: refusal.reason,
  });
}

function stopReport(signal: AbortSignal, after: EngageAfter): Report {
  const code = messageOf(signal.reason, "cancelled");
  if (code === "human_stop" || code === "esc")
    return result("FAILED", {
      after,
      detail: "the human stopped you. Start nothing new.",
      next: "end your turn and wait for the human.",
      reason: "cancelled",
    });
  return result("FAILED", {
    after,
    detail: `the fight was stopped (${code}).`,
    next: nextCall("look"),
    reason: "cancelled",
  });
}

function runStatus(
  report: Report,
  stopped: boolean,
): Exclude<RunStatus, "running"> {
  if (stopped) return "cancelled";
  if (report.reason === "died") return "interrupted";
  if (report.status === "DONE") return "succeeded";
  return report.status === "PARTLY" ? "partly" : "failed";
}

function runEnd(report: Report, stop?: string): RunEnd<Report> {
  return {
    reason: stop ?? report.reason,
    status: runStatus(report, stop !== undefined),
    summary: `${report.status} ${report.detail}`,
    value: report,
  };
}

async function launch(init: {
  ctx: ToolCtx<EngageAfter>;
  args: EngageArgs;
  control: RunControl;
  latest: Latest;
  runId: () => string;
}): Promise<RunEnd<Report>> {
  const { ctx, args, control, latest } = init;
  const before = completeQuestIds(ctx.handle.getQuestState());
  const rules = { death: true, newAttacker: false, rooted: true };
  const watch = watchInterrupts(
    { ...ctx, progress: control.progress, signal: control.signal },
    rules,
  );
  const ops: OpsCtx = {
    ...ctx,
    progress: control.progress,
    signal: AbortSignal.any([control.signal, watch.signal]),
  };
  const progress = (after: EngageAfter) => {
    latest.after = after;
    control.progress(`${after.kills} of ${after.wanted} kills`);
    ctx.update(
      result("RUNNING", {
        after,
        detail: `engage ${after.kills} of ${after.wanted} kills.`,
        runId: init.runId(),
      }),
    );
  };
  try {
    const ride = await dismountFirst(ops);
    const choice = await chooseTarget(ops, args);
    const fightReport = await FIGHT({
      args,
      cause: watch.cause,
      choice,
      control,
      ops,
      progress,
    });
    const report = withDismountedFirst(ride, fightReport);
    if (control.signal.aborted)
      return runEnd(
        stopReport(control.signal, report.after),
        messageOf(control.signal.reason),
      );
    return runEnd(noteQuestsDone(ops, before, report));
  } catch (error) {
    if (error instanceof Refusal)
      return runEnd(refusalReport(error, latest.after));
    if (!control.signal.aborted) throw error;
    return runEnd(
      stopReport(control.signal, latest.after),
      messageOf(control.signal.reason),
    );
  } finally {
    watch.dispose();
  }
}

function runningDetail(ctx: ViewCtx, after: EngageAfter): string {
  const current = after.current;
  const fighting = current
    ? `, fighting ${current.name} ${current.ref} (${current.hpPct}%)`
    : "";
  return `engage ${after.kills} of ${after.wanted} kills${fighting}. ${youLine(ctx)}`;
}

async function runEngage(
  args: EngageArgs,
  ctx: ToolCtx<EngageAfter>,
): Promise<Report> {
  guardPull(ctx, args);
  checkHelper(ctx);
  if (args.quest !== undefined) parseQuest(ctx, args.quest);
  const latest: Latest = { after: emptyEngage() };
  let runId = "";
  const run = ctx.rt.runs.start<Report>({
    args,
    kind: "engage",
    launch: (control) =>
      launch({ args, control, ctx, latest, runId: () => runId }),
    toolCallId: ctx.toolCallId,
  });
  runId = run.id;
  const waited = await awaitRun({ rt: ctx.rt, run });
  if (waited.kind === "ended") return { ...waited.end.value, runId };
  return result("RUNNING", {
    after: latest.after,
    body: waited.why === "human" ? [HUMAN_WROTE] : [],
    detail: runningDetail(ctx, latest.after),
    next: `end your turn; a [game] message comes when ${runId} ends. Or ${nextCall("stop", { run: runId })}.`,
    runId,
  });
}

export const engageSpec: GameToolSpec<
  typeof engageParams,
  "engage",
  EngageAfter
> = {
  fallback: emptyEngage,
  kind: "run",
  minimalArgs: {},
  name: "engage",
  parameters: engageParams,
  renderers: engageRenderers,
  run: runEngage,
  text: {
    description:
      "Finds a hostile unit, walks to it, fights it and loots it. It waits until the fight ends, up to two minutes. With count or quest it fights more than one unit. It refuses when your health or mana is low or when another unit attacks you.",
    guidelines: [
      "Leave target empty to fight the nearest hostile. Use quest to fight for a quest objective.",
      "If it refuses because your health or mana is low, call rest. Then call engage again.",
    ],
    label: "Engage",
  },
};

export const engageTool = defineGameTool(engageSpec);
