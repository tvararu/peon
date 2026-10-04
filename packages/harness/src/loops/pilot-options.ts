import type { GroundOracle } from "@peon/core";
import { distance2d, type MovementInput, normalizeAngle } from "@peon/core";
import type { JevCandidate } from "#harness/jev/contract";
import {
  goalBearingText,
  jumpableTop,
  jumpOffered,
  lapPoint,
  PILOT_MIN_CLEAR_YD,
  PILOT_RANGE_YD,
  PILOT_STEP_YD,
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

export type ScanCache = {
  pose: PilotPose;
  ground: GroundOracle | undefined;
  scans: Map<number, PilotScan>;
};

export function scanCache(
  ground: GroundOracle | undefined,
  pose: PilotPose,
): ScanCache {
  return { ground, pose, scans: new Map() };
}

export function cachedScan(cache: ScanCache, heading: number): PilotScan {
  const norm = normalizeAngle(heading);
  const key = Math.round(norm * 1e6);
  const hit = cache.scans.get(key);
  if (hit) return hit;
  const scan = scanHeading(cache.ground, cache.pose, norm);
  cache.scans.set(key, scan);
  return scan;
}

export type OptionBuild = {
  ground: GroundOracle | undefined;
  objective: PilotObjective;
  pose: PilotPose;
  cache?: ScanCache;
};

export function buildOptions({
  ground,
  objective,
  pose,
  cache,
}: OptionBuild): PilotOption[] {
  if (pose.airborne) return [];
  const scans = cache ?? scanCache(ground, pose);
  const ahead = cachedScan(scans, pose.orientation);
  const canJump = jumpOffered(ground, pose, ahead);
  return PILOT_OPTION_IDS.flatMap((id) => {
    if (id === "stop")
      return [
        {
          description: stopText(objective, pose),
          heading: pose.orientation,
          id,
          input: undefined,
          turnDeg: 0,
        },
      ];
    const option = moveOption({ ahead, canJump, id, objective, pose, scans });
    return option ? [option] : [];
  });
}

type MoveBuild = {
  id: Exclude<PilotOptionId, "stop">;
  ahead: PilotScan;
  canJump: boolean;
  objective: PilotObjective;
  pose: PilotPose;
  scans: ScanCache;
};

function moveOption(build: MoveBuild): PilotOption | undefined {
  const { ahead, canJump, id, pose, scans } = build;
  if (id === "jump_ahead" && !canJump) return undefined;
  const turnDeg = OPTION_TURNS[id];
  const heading = normalizeAngle(pose.orientation + (turnDeg * Math.PI) / 180);
  const motion = OPTION_MOTION[id];
  const scan =
    id === "run_ahead" || id === "jump_ahead"
      ? ahead
      : cachedScan(scans, heading + ((motion ?? 0) * Math.PI) / 180);
  const tooClose = id !== "jump_ahead" && scan.freeYd < PILOT_MIN_CLEAR_YD;
  if (tooClose && !(motion === undefined && jumpableTop(scan.blocker)))
    return undefined;
  return {
    description: optionText({ ...build, scan, turnDeg }),
    heading,
    id,
    input: tooClose ? {} : OPTION_INPUTS[id],
    turnDeg,
  };
}

export function scansForHeadings(
  cache: ScanCache,
  pose: PilotPose,
): PilotScan[] {
  const headings = [0, 45, 90, 135, 180, 225, 270, 315].map(
    (deg) => pose.orientation + (deg * Math.PI) / 180,
  );
  return headings.map((heading) => cachedScan(cache, heading));
}

export function blockerText(scan: PilotScan): string {
  const { blocker } = scan;
  if (blocker.kind === "open") return "open";
  if (blocker.kind === "wall") return "a wall";
  if (blocker.kind === "drop") return "a drop or steep slope";
  return `a low obstacle ${blocker.topYd.toFixed(1)} yd high`;
}

export function lineText(line: PilotScan, spanYd: number): string {
  if (line.freeYd >= Math.min(spanYd, PILOT_RANGE_YD) - PILOT_STEP_YD)
    return "the straight line to it is clear";
  const what = `${blockerText(line)} ${line.freeYd} yd away`;
  if (jumpableTop(line.blocker))
    return `the straight line to it crosses ${what}, low enough to jump`;
  return `the straight line to it is blocked by ${what}; go around it`;
}

type OptionTextInput = {
  id: Exclude<PilotOptionId, "stop">;
  objective: PilotObjective;
  pose: PilotPose;
  scan: PilotScan;
  ahead: PilotScan;
  canJump: boolean;
  turnDeg: number;
};

function optionText({
  ahead,
  canJump,
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
    return `Run at the ${blockerText(scan)} ${scan.freeYd} yd ahead and jump it as you reach it; ${goal}.`;
  if (scan.freeYd < PILOT_MIN_CLEAR_YD)
    return `${actions[id]}: faces the ${blockerText(scan)} ${scan.freeYd} yd away, too close to jump; back up first for a run-up; ${goal}.`;
  if (id === "back_up" && !canJump && jumpableTop(ahead.blocker))
    return `Back up: clear for ${scan.freeYd} yd; gains run-up to jump the ${blockerText(ahead)} ahead; ${goal}.`;
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
  const next = lapPoint(objective, pose);
  const bearing = Math.atan2(next.y - pose.y, next.x - pose.x);
  return `the next lap point would be ${goalBearingText(relativeDeg(bearing, facing))}`;
}
