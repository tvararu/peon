import type { WorldHandle } from "@tuicraft/core";
import type { ToolName, ToolResult } from "#harness/contract/result";
import type { HarnessRuntime, ViewCtx } from "#harness/contract/services";
import type { Compass } from "#harness/contract/views";
import { dangerView } from "#harness/ops/danger";
import { compassWord } from "#harness/ops/explore";
import { compassTo } from "#harness/ops/range";
import {
  type CallShape,
  CONTINUES,
  moved,
  POSITIONAL,
  parseCall,
  stable,
} from "#harness/ops/repeat-guard";
import { repeatScene, targetText } from "#harness/ops/repeat-scene";
import { resolveUnit } from "#harness/ops/resolve";
import { poseView } from "#harness/ops/views";
import { askHuman, nextCall } from "#harness/tools/next-call";

export type GuardScene = {
  attacker: string | undefined;
  bearing: Compass | undefined;
  failedElsewhere: boolean;
};

const GUARDED = new Set(["PARTLY", "REFUSED", "FAILED"]);

export function guardNext<A>(
  outcome: ToolResult<A>,
  init: CallShape & {
    blocked: (call: CallShape) => boolean;
    progressed: boolean;
    scene: () => GuardScene;
  },
): ToolResult<A> {
  if (
    !GUARDED.has(outcome.status) ||
    outcome.next === undefined ||
    CONTINUES.includes(outcome.reason ?? "")
  )
    return outcome;
  const call = parseCall(outcome.next);
  if (!call) return repeatUnderAttack(outcome, init.scene);
  const same =
    call.tool === init.tool && stable(call.args) === stable(init.args);
  if ((same && init.progressed) || !init.blocked(call)) return outcome;
  const { attacker, bearing, failedElsewhere } = init.scene();
  if (attacker !== undefined) return engaging(outcome, call, attacker);
  const why = outcome.reason ?? outcome.status.toLowerCase();
  if (POSITIONAL.has(why) && bearing !== undefined && !failedElsewhere)
    return {
      ...outcome,
      next: nextCall("travel", { to: `explore ${compassWord(bearing)}` }),
    };
  const how = outcome.status === "PARTLY" ? "stopped" : "failed";
  const again = same
    ? "repeating it will not help"
    : `${call.tool} already failed from here`;
  return {
    ...outcome,
    next: askHuman(
      `My ${init.tool} call ${how} (${why}) and ${again}. What should I do?`,
    ),
  };
}

function engaging<A>(
  outcome: ToolResult<A>,
  call: CallShape,
  attacker: string,
): ToolResult<A> {
  return call.tool === "engage" && call.args["target"] === attacker
    ? outcome
    : { ...outcome, next: nextCall("engage", { target: attacker }) };
}

function repeatUnderAttack<A>(
  outcome: ToolResult<A>,
  scene: () => GuardScene,
): ToolResult<A> {
  if (
    outcome.reason !== "repeat" ||
    !outcome.next?.startsWith("ask the human:")
  )
    return outcome;
  const { attacker } = scene();
  return attacker === undefined
    ? outcome
    : { ...outcome, next: nextCall("engage", { target: attacker }) };
}

const COORDS = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/;

function bearingTo(ctx: ViewCtx, args: unknown): Compass | undefined {
  const text = targetText(args);
  if (text === undefined) return;
  const coords = COORDS.exec(text);
  const pose = poseView(ctx);
  if (coords && pose)
    return compassTo(pose, { x: Number(coords[1]), y: Number(coords[2]) });
  const found = resolveUnit(ctx, { text });
  return found.kind === "unit" ? found.unit.compass : undefined;
}

function guardScene(
  ctx: ViewCtx,
  init: { args: unknown; tool: ToolName },
): GuardScene {
  const pose = poseView(ctx);
  const before = ctx.rt.repeats.positionalPoses(init.tool);
  return {
    attacker: dangerView(ctx).attackers[0]?.ref,
    bearing: bearingTo(ctx, init.args),
    failedElsewhere: pose !== undefined && before.some((at) => moved(at, pose)),
  };
}

export function guardCall<A>(
  init: {
    args: unknown;
    handle: WorldHandle | undefined;
    rt: HarnessRuntime;
    startedAt: number;
    tool: ToolName;
  },
  outcome: ToolResult<A>,
): ToolResult<A> {
  const { handle, rt, startedAt } = init;
  const here = handle && {
    digest: rt.progress.digest(handle),
    pose: poseView({ handle, rt }),
  };
  return guardNext(outcome, {
    args: init.args as Record<string, unknown>,
    blocked: (call) =>
      here !== undefined &&
      handle !== undefined &&
      rt.repeats.blocks({
        ...here,
        args: call.args,
        scene: repeatScene({ handle, rt }, call.args),
        tool: call.tool as ToolName,
      }),
    progressed: (rt.progress.lastProgress()?.at ?? -1) >= startedAt,
    scene: () =>
      handle
        ? guardScene({ handle, rt }, init)
        : { attacker: undefined, bearing: undefined, failedElsewhere: false },
    tool: init.tool,
  });
}
