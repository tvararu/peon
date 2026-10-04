import type { ControlState, GroundOracle, RecoveryState } from "@peon/core";
import {
  circleOutcome,
  describeSelf,
  describeSurroundings,
  freshMemory,
  objectiveText,
  type PilotMemory,
  reachOutcome,
} from "#harness/loops/pilot-frame";
import { type PilotPose, poseOf } from "#harness/loops/pilot-geometry";
import { buildOptions, type PilotOption } from "#harness/loops/pilot-options";
import type { PilotContext } from "#harness/loops/pilot-types";
import type { ControlPort } from "#harness/loops/ports";
import type { TacticsFrame } from "#harness/loops/tactics";

export const PILOT_DEADMAN_MS = 1500;

export type PilotFrameDeps = {
  control: Pick<ControlPort, "snapshot" | "face" | "drive" | "jump" | "halt">;
  ground: GroundOracle | undefined;
  life: () => RecoveryState["life"];
  now?: () => number;
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

  constructor(deps: PilotFrameDeps) {
    this.deps = deps;
  }

  activate(): void {
    this.memory = freshMemory();
    this.lastPose = undefined;
  }

  observe(context: PilotContext): TacticsFrame {
    const framed = this.frame(context);
    return {
      candidates: framed.candidates,
      observation: framed.observation,
      ...(framed.outcome && { outcome: framed.outcome }),
    };
  }

  peek(context: PilotContext): PilotObserve {
    return this.frame(context);
  }

  execute(actionId: string, context: PilotContext): void {
    const framed = this.frame(context);
    const option = framed.candidates.find(
      (candidate) => candidate.id === actionId,
    );
    if (!option) throw new Error(`unknown_pilot_action: ${actionId}`);
    const state = this.deps.control.snapshot();
    const pose = state.pose;
    if (pose) this.lastPose = { x: pose.x, y: pose.y };
    if (actionId === "stop") {
      this.deps.control.halt("pilot_stop");
      this.note(actionId);
      return;
    }
    if (option.input === undefined)
      throw new Error(`unknown_pilot_action: ${actionId}`);
    this.deps.control.face(option.heading);
    this.deps.control.drive(option.input, PILOT_DEADMAN_MS);
    if (actionId === "jump_ahead") this.deps.control.jump();
    this.note(actionId);
  }

  halt(): void {
    this.deps.control.halt("pilot_halt");
  }

  private note(actionId: string): void {
    const pose = this.deps.control.snapshot().pose;
    const moved =
      pose && this.lastPose
        ? Math.round(
            Math.hypot(pose.x - this.lastPose.x, pose.y - this.lastPose.y) * 10,
          ) / 10
        : 0;
    this.memory.decisions.push({ actionId, movedYd: moved });
    if (this.memory.decisions.length > 3) this.memory.decisions.shift();
    if (pose) this.lastPose = { x: pose.x, y: pose.y };
  }

  private frame(context: PilotContext): PilotObserve {
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
  return objective.kind === "reach"
    ? reachOutcome(objective, pose.x, pose.y, dead)
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
  pilotPose,
  pose,
  state,
}: FrameInput & {
  ground: GroundOracle | undefined;
  pilotPose: PilotPose;
}): PilotObserve {
  const framed = objectiveText({
    facing: pilotPose.orientation,
    memory,
    objective: context.objective,
    x: pose.x,
    y: pose.y,
  });
  const candidates = buildOptions({
    ground,
    objective: context.objective,
    pose: pilotPose,
  });
  return {
    candidates,
    distanceYd: framed.distanceYd,
    observation: {
      objective: framed.detail,
      self: selfText(state, memory),
      surroundings: describeSurroundings(ground, pilotPose),
    },
  };
}
