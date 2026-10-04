import { afterAll, describe, test } from "bun:test";
import { existsSync } from "node:fs";
import { distance2d, groundStep, type NavPoint } from "@peon/core";
import { navigationSource } from "#harness/navigation/maps";
import { NUDGE_REACH_YD, nudgeTarget } from "#harness/navigation/nudge";
import { groundOracle } from "#harness/navigation/oracle";
import { createNavigation, type Navigation } from "#harness/navigation/planner";

const dataPath = process.env["NAV_DATA"] ?? "";
const libraryPath = process.env["NAV_LIB"] ?? "";
const present =
  dataPath !== "" &&
  libraryPath !== "" &&
  existsSync(dataPath) &&
  existsSync(libraryPath);

type Goal = { x: number; y: number; z?: number };

const cases: { label: string; mapId: number; pose: NavPoint; goals: Goal[] }[] =
  [
    {
      goals: [{ x: 10_402.9, y: -6343.5, z: 36.9 }],
      label: "Sunspire",
      mapId: 530,
      pose: { x: 10_408.6, y: -6337.8, z: 37.4 },
    },
    {
      goals: [{ x: -9746.3, y: 139.3, z: 19.58 }],
      label: "Fargodeep",
      mapId: 0,
      pose: { x: -9754.3, y: 139.3, z: 20.6 },
    },
    {
      goals: [
        [10_411.4, -6368.8],
        [10_413.7, -6374.5],
        [10_405.7, -6366.5],
        [10_411.4, -6380.2],
        [10_400, -6368.8],
        [10_405.7, -6382.5],
        [10_397.7, -6374.5],
        [10_400, -6380.2],
      ].map(([x, y]) => ({ x: x ?? 0, y: y ?? 0 })),
      label: "Sunstrider",
      mapId: 530,
      pose: { x: 10_405.7, y: -6374.5, z: 35.7 },
    },
  ];

describe.skipIf(!present)(
  "recorded off-mesh starts nudge back onto the mesh",
  () => {
    let opened: Navigation | undefined;
    const nav = () => {
      opened ??= createNavigation(
        navigationSource({ dataDir: dataPath, library: libraryPath }).open,
      );
      return opened;
    };
    afterAll(() => opened?.close());

    for (const { label, mapId, pose, goals } of cases)
      test(`${label} start refuses raw`, () => {
        refusesRaw(nav(), mapId, pose, goals);
      });
    for (const { label, mapId, pose, goals } of cases)
      test(`${label} start nudges onto the mesh and plans onward`, () => {
        plansFromNudge(nav(), mapId, pose, goals);
      });
  },
);

function refusesRaw(
  navigation: Navigation,
  mapId: number,
  pose: NavPoint,
  goals: Goal[],
): void {
  if (navigation.snap(mapId, pose)?.onMesh !== false)
    throw new Error("expected an off-mesh start");
  for (const goal of goals) {
    let refused = false;
    try {
      if (goal.z === undefined) navigation.planGround(mapId, pose, goal);
      else navigation.plan(mapId, pose, { x: goal.x, y: goal.y, z: goal.z });
    } catch (error) {
      refused =
        error instanceof Error && error.message.includes("start snapped off");
    }
    if (!refused) throw new Error("expected the raw start to refuse");
  }
}

function plansFromNudge(
  navigation: Navigation,
  mapId: number,
  pose: NavPoint,
  goals: Goal[],
): void {
  const spot = nudgeTarget(navigation, mapId, pose);
  if (!spot) throw new Error("expected a nudge target");
  if (distance2d(pose, spot) > NUDGE_REACH_YD)
    throw new Error("nudge target is out of reach");
  walkStraight(navigation, mapId, pose, spot);
  if (navigation.snap(mapId, spot)?.onMesh !== true)
    throw new Error("nudge target is off the mesh");
  for (const goal of goals) {
    const route =
      goal.z === undefined
        ? navigation.planGround(mapId, spot, goal)
        : navigation.plan(mapId, spot, { x: goal.x, y: goal.y, z: goal.z });
    const end = route.points.at(-1);
    if (end === undefined) throw new Error("route has no end");
    if (Math.abs(end.x - goal.x) > 0.01 || Math.abs(end.y - goal.y) > 0.01)
      throw new Error("route misses the goal");
  }
}

function walkStraight(
  navigation: Navigation,
  mapId: number,
  from: NavPoint,
  to: NavPoint,
): void {
  const oracle = groundOracle(navigation);
  const total = distance2d(from, to);
  const steps = Math.max(1, Math.ceil(total / 0.5));
  const pose = { mapId, orientation: 0, x: from.x, y: from.y, z: from.z };
  for (let i = 1; i <= steps; i++) {
    const ratio = i / steps;
    const step = groundStep(
      oracle,
      pose,
      {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      },
      true,
    );
    if (!step.ok) throw new Error(`nudge step ${i} refused: ${step.reason}`);
    pose.x = from.x + (to.x - from.x) * ratio;
    pose.y = from.y + (to.y - from.y) * ratio;
    pose.z = step.z;
  }
}
