import type { GroundOracle } from "@peon/core";
import { distance2d, type MovementInput, normalizeAngle } from "@peon/core";
import type { JevCandidate } from "#harness/jev/contract";
import {
  circleTangent,
  goalBearingText,
  jumpGate,
  PILOT_MIN_CLEAR_YD,
  type PilotPose,
  type PilotScan,
  relativeDeg,
  scanHeading,
} from "#harness/loops/pilot-geometry";
import type { PilotObjective } from "#harness/loops/pilot-types";

export const PILOT_OPTION_IDS = [
  "run_ahead",
  "veer_left",
  "veer_right",
  "turn_left",
  "turn_right",
  "turn_around",
  "strafe_left",
  "strafe_right",
  "back_up",
  "jump_ahead",
  "stop",
] as const;

export type PilotOptionId = (typeof PILOT_OPTION_IDS)[number];

export type PilotOption = JevCandidate & {
  heading: number;
  input: MovementInput | undefined;
  turnDeg: number;
};

const OPTION_TURNS: Record<Exclude<PilotOptionId, "stop">, number> = {
  back_up: 0,
  jump_ahead: 0,
  run_ahead: 0,
  strafe_left: 0,
  strafe_right: 0,
  turn_around: 180,
  turn_left: 90,
  turn_right: -90,
  veer_left: 30,
  veer_right: -30,
};

const OPTION_MOTION: Partial<Record<PilotOptionId, number>> = {
  back_up: 180,
  strafe_left: 90,
  strafe_right: -90,
};

const OPTION_INPUTS: Record<Exclude<PilotOptionId, "stop">, MovementInput> = {
  back_up: { move: "backward" },
  jump_ahead: { move: "forward" },
  run_ahead: { move: "forward" },
  strafe_left: { strafe: "left" },
  strafe_right: { strafe: "right" },
  turn_around: { move: "forward" },
  turn_left: { move: "forward" },
  turn_right: { move: "forward" },
  veer_left: { move: "forward" },
  veer_right: { move: "forward" },
};

export type OptionBuild = {
  ground: GroundOracle | undefined;
  objective: PilotObjective;
  pose: PilotPose;
};

export function buildOptions({
  ground,
  objective,
  pose,
}: OptionBuild): PilotOption[] {
  if (pose.airborne) return [];
  const ahead = scanHeading(ground, pose, pose.orientation);
  const canJump = jumpGate(ground, pose, ahead);
  const options: PilotOption[] = [];
  for (const id of PILOT_OPTION_IDS) {
    if (id === "stop") {
      options.push({
        description: stopText(objective, pose),
        heading: pose.orientation,
        id,
        input: undefined,
        turnDeg: 0,
      });
      continue;
    }
    if (id === "jump_ahead" && !canJump) continue;
    const turnDeg = OPTION_TURNS[id];
    const heading = normalizeAngle(
      pose.orientation + (turnDeg * Math.PI) / 180,
    );
    const motion = OPTION_MOTION[id] ?? 0;
    const scan =
      id === "run_ahead" || id === "jump_ahead"
        ? ahead
        : scanHeading(ground, pose, heading + (motion * Math.PI) / 180);
    if (scan.freeYd < PILOT_MIN_CLEAR_YD) continue;
    options.push({
      description: optionText({ id, objective, pose, scan, turnDeg }),
      heading,
      id,
      input: OPTION_INPUTS[id],
      turnDeg,
    });
  }
  return options;
}

export function scansForHeadings(
  ground: GroundOracle | undefined,
  pose: PilotPose,
): PilotScan[] {
  const headings = [0, 45, 90, 135, 180, 225, 270, 315].map(
    (deg) => pose.orientation + (deg * Math.PI) / 180,
  );
  return headings.map((heading) => scanHeading(ground, pose, heading));
}

export function blockerText(scan: PilotScan): string {
  const { blocker } = scan;
  if (blocker.kind === "open") return "open";
  if (blocker.kind === "wall") return "a wall";
  if (blocker.kind === "drop") return "a drop or steep slope";
  return `a low obstacle ${blocker.topYd.toFixed(1)} yd high`;
}

type OptionTextInput = {
  id: Exclude<PilotOptionId, "stop">;
  objective: PilotObjective;
  pose: PilotPose;
  scan: PilotScan;
  turnDeg: number;
};

function optionText({
  id,
  objective,
  pose,
  scan,
  turnDeg,
}: OptionTextInput): string {
  const actions: Record<Exclude<PilotOptionId, "stop">, string> = {
    back_up: "Back up",
    jump_ahead: "Jump forward",
    run_ahead: "Run ahead",
    strafe_left: "Strafe left",
    strafe_right: "Strafe right",
    turn_around: "Turn around and run",
    turn_left: "Turn 90° left and run",
    turn_right: "Turn 90° right and run",
    veer_left: "Veer 30° left and run",
    veer_right: "Veer 30° right and run",
  };
  const after = normalizeAngle(pose.orientation + (turnDeg * Math.PI) / 180);
  const goal = goalAfterTurn(objective, pose, after);
  if (id === "jump_ahead")
    return `${actions[id]} over the low obstacle ahead: clear; ${goal}.`;
  return `${actions[id]}: clear for ${scan.freeYd} yd; ${goal}.`;
}

function stopText(objective: PilotObjective, pose: PilotPose): string {
  return `Stop and stand still; ${goalAfterTurn(objective, pose, pose.orientation)}.`;
}

function goalAfterTurn(
  objective: PilotObjective,
  pose: PilotPose,
  facing: number,
): string {
  if (objective.kind === "reach") {
    const distance = Math.round(distance2d(pose, objective) * 10) / 10;
    const bearing = Math.atan2(objective.y - pose.y, objective.x - pose.x);
    return `the goal would be ${distance} yd ${goalBearingText(relativeDeg(bearing, facing))}`;
  }
  const tangent = circleTangent(objective, pose);
  return `the circle would continue ${goalBearingText(relativeDeg(tangent, facing))}`;
}
