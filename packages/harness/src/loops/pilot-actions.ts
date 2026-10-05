import type {
  ControlState,
  GroundOracle,
  NearbyRow,
  RecoveryState,
} from "@peon/core";
import {
  circleOutcome,
  describeSelf,
  describeSurroundings,
  freshMemory,
  objectiveText,
  type PilotMemory,
  reachOutcome,
} from "#harness/loops/pilot-frame";
import {
  lapPoint,
  type PilotPose,
  poseOf,
  scanHeading,
} from "#harness/loops/pilot-geometry";
import { JumpArm } from "#harness/loops/pilot-jump";
import {
  buildOptions,
  cachedScan,
  DANGER_ANNOTATE_YD,
  lineText,
  type PilotOption,
  scanCache,
} from "#harness/loops/pilot-options";
import type { PilotContext } from "#harness/loops/pilot-types";
import {
  aggroCircles,
  buildPilotUnits,
  dangerAlong,
  unitLines,
} from "#harness/loops/pilot-units";
import type { ControlPort } from "#harness/loops/ports";
import type { TacticsFrame } from "#harness/loops/tactics";

export const PILOT_DEADMAN_MS = 1500;

export type PilotFrameDeps = {
  control: Pick<
    ControlPort,
    "snapshot" | "face" | "drive" | "jump" | "halt" | "settle"
  >;
  ground: GroundOracle | undefined;
  life: () => RecoveryState["life"];
  now?: () => number;
  nearby?: () => readonly NearbyRow[];
};

export type PilotObserve = {
  observation: Readonly<Record<string, unknown>>;
  candidates: PilotOption[];
  outcome?: TacticsFrame["outcome"];
  distanceYd: number;
};

export class PilotActions {
  private readonly deps: PilotFrameDeps;
  private memory: PilotMemory = freshMemory();
  private lastPose: { x: number; y: number } | undefined;
  private committed:
    | { context: PilotContext; framed: PilotObserve }
    | undefined;
  private readonly jump: JumpArm;

  constructor(deps: PilotFrameDeps) {
    this.deps = deps;
    this.jump = new JumpArm({
      control: deps.control,
      ground: deps.ground,
      now: deps.now ?? (() => Date.now()),
    });
  }

  activate(): void {
    this.memory = freshMemory();
    this.lastPose = undefined;
    this.committed = undefined;
    this.jump.disarm();
  }

  observe(context: PilotContext): TacticsFrame {
    const framed = this.frame(context);
    return {
      candidates: framed.candidates,
      observation: framed.observation,
      ...(framed.outcome && { outcome: framed.outcome }),
    };
  }

  commit(context: PilotContext): PilotObserve {
    const framed = this.frame(context);
    this.committed = { context, framed };
    return framed;
  }

  execute(actionId: string, context: PilotContext): void {
    const framed =
      this.committed?.context === context
        ? this.committed.framed
        : this.frame(context);
    this.committed = undefined;
    const option = framed.candidates.find(
      (candidate) => candidate.id === actionId,
    );
    if (!option) throw new Error(`unknown_pilot_action: ${actionId}`);
    this.jump.disarm();
    this.settle();
    const state = this.deps.control.snapshot();
    const pose = state.pose;
    if (pose) this.lastPose = { x: pose.x, y: pose.y };
    if (actionId === "stop") {
      this.deps.control.halt("pilot_stop");
      this.memory.decisions.push({ actionId, movedYd: 0 });
      if (this.memory.decisions.length > 3) this.memory.decisions.shift();
      return;
    }
    const input = option.input;
    if (input === undefined)
      throw new Error(`unknown_pilot_action: ${actionId}`);
    this.deps.control.face(option.heading);
    this.deps.control.drive(input, PILOT_DEADMAN_MS);
    if (actionId === "jump_ahead") this.armJump();
    this.memory.decisions.push({ actionId, movedYd: 0 });
    if (this.memory.decisions.length > 3) this.memory.decisions.shift();
  }

  halt(): void {
    this.jump.disarm();
    this.deps.control.halt("pilot_halt");
  }

  private armJump(): void {
    const state = this.deps.control.snapshot();
    if (state.pose === undefined) return;
    const pose = poseOf(state.pose, state.speed, state.airborne);
    const ahead = scanHeading(this.deps.ground, pose, pose.orientation);
    this.jump.arm(ahead.freeYd);
  }

  private settle(): void {
    const previous = this.memory.decisions.at(-1);
    const pose = this.deps.control.snapshot().pose;
    if (previous && pose && this.lastPose)
      previous.movedYd =
        Math.round(
          Math.hypot(pose.x - this.lastPose.x, pose.y - this.lastPose.y) * 10,
        ) / 10;
    if (pose) this.lastPose = { x: pose.x, y: pose.y };
  }

  private frame(context: PilotContext): PilotObserve {
    this.deps.control.settle();
    const state = this.deps.control.snapshot();
    const pose = state.pose;
    const dead = isDead(this.deps.life());
    if (!pose) return missingPoseFrame(state, dead, this.memory);
    const pilotPose = poseOf(pose, state.speed, state.airborne);
    const outcome = outcomeOf(context, this.memory, pose, dead);
    if (outcome)
      return outcomeFrame({
        context,
        memory: this.memory,
        outcome,
        pose,
        state,
      });
    return liveFrame({
      context,
      ground: this.deps.ground,
      memory: this.memory,
      nearby: this.deps.nearby?.() ?? [],
      pilotPose,
      pose,
      state,
    });
  }
}

function isDead(life: RecoveryState["life"]): boolean {
  return life === "dead" || life === "ghost";
}

type PoseState = {
  input: ControlState["input"];
  airborne: boolean;
  speed: number;
};

function selfText(state: PoseState, memory: PilotMemory): string {
  return describeSelf(state.input, state.airborne, state.speed, memory);
}

function missingPoseFrame(
  state: PoseState,
  dead: boolean,
  memory: PilotMemory,
): PilotObserve {
  return {
    candidates: dead
      ? []
      : [
          {
            description: "Stop and stand still.",
            goalDeg: 180,
            heading: 0,
            id: "stop",
            input: undefined,
            turnDeg: 0,
          },
        ],
    distanceYd: Number.POSITIVE_INFINITY,
    observation: {
      objective: "the goal pose is unknown; stop",
      self: selfText(state, memory),
      surroundings: [],
    },
    ...(dead && {
      outcome: { reason: "self_dead", status: "failed" as const },
    }),
  };
}

function outcomeOf(
  context: PilotContext,
  memory: PilotMemory,
  pose: { x: number; y: number },
  dead: boolean,
): TacticsFrame["outcome"] {
  const objective = context.objective;
  const from = memory.lastSeen;
  memory.lastSeen = { x: pose.x, y: pose.y };
  return objective.kind === "reach"
    ? reachOutcome({ at: pose, dead, from, objective })
    : circleOutcome({ dead, memory, objective, x: pose.x, y: pose.y });
}

type FrameInput = {
  state: PoseState;
  memory: PilotMemory;
  context: PilotContext;
  pose: { x: number; y: number };
};

function outcomeFrame({
  context,
  memory,
  outcome,
  pose,
  state,
}: FrameInput & {
  outcome: NonNullable<TacticsFrame["outcome"]>;
}): PilotObserve {
  const objective = context.objective;
  return {
    candidates: [],
    distanceYd:
      objective.kind === "reach"
        ? Math.hypot(objective.x - pose.x, objective.y - pose.y)
        : Math.abs(
            Math.hypot(objective.x - pose.x, objective.y - pose.y) -
              objective.radius,
          ),
    observation: {
      objective: outcome.reason,
      self: selfText(state, memory),
      surroundings: [],
    },
    outcome,
  };
}

function liveFrame({
  context,
  ground,
  memory,
  nearby,
  pilotPose,
  pose,
  state,
}: FrameInput & {
  ground: GroundOracle | undefined;
  nearby: readonly NearbyRow[];
  pilotPose: PilotPose;
}): PilotObserve {
  const framed = objectiveText({
    facing: pilotPose.orientation,
    memory,
    objective: context.objective,
    x: pose.x,
    y: pose.y,
  });
  const cache = scanCache(ground, pilotPose);
  const objective = context.objective;
  const target =
    objective.kind === "reach" ? objective : lapPoint(objective, pose);
  const heading = Math.atan2(target.y - pose.y, target.x - pose.x);
  const line = cachedScan(cache, heading);
  const span = Math.hypot(target.x - pose.x, target.y - pose.y);
  const units = buildPilotUnits(nearby, pilotPose);
  const circles = aggroCircles(units);
  const hazard = dangerAlong(pilotPose, heading, circles, DANGER_ANNOTATE_YD);
  const candidates = buildOptions({
    cache,
    circles,
    ground,
    objective,
    pose: pilotPose,
  });
  return {
    candidates,
    distanceYd: framed.distanceYd,
    observation: {
      objective: `${framed.detail}; ${lineText(line, span, hazard)}`,
      self: selfText(state, memory),
      surroundings: describeSurroundings(cache, pilotPose),
      units: unitLines(units, pilotPose),
    },
  };
}
