import { createNavigation } from "../../packages/harness/src/navigation/planner";
import { navigationSource } from "../../packages/harness/src/navigation/maps";

const EXPANSION01 = 530;
const CORNER = { x: 8733.333, y: -6666.666 };
const SPAWN = { x: 8735, y: -6685, z: 70.5 };
const HALIS = { x: 8731.69, y: -6656.5 };

const KALIMDOR = 1;
const RAZOR_HILL = { x: 338, y: -4690, z: 16.5 };
const DUROTAR_TARGET = { x: 310, y: -4730 };

const NORTHREND = 571;
const BLEEDING_VALE = { x: 1923.72, y: -5990, z: 9.3 };
const VENGEANCE_LANDING_ROAD = { x: 1873.32, y: -6180 };
const MIN_RIDE = 150;

const [libraryPath] = process.argv.slice(2);
const dataPath = process.env["NAV_DATA"];
if (!libraryPath || !dataPath) {
  console.error("usage: NAV_DATA=<nav dir> check.ts <libnamigator.so>");
  process.exit(2);
}

function attempt(run: () => unknown): string {
  try {
    run();
    return "ok";
  } catch (error) {
    return error instanceof Error ? error.message : "error";
  }
}

const nav = createNavigation(navigationSource({ dataDir: dataPath, library: libraryPath }).open);

function walked(
  mapId: number,
  from: { x: number; y: number; z: number },
  to: { x: number; y: number },
  minimum: number,
): string {
  try {
    const { points } = nav.planGround(mapId, from, to);
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      if (a && b) length += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return length >= minimum ? "ok" : `short route: ${length.toFixed(1)} yd`;
  } catch (error) {
    return error instanceof Error ? error.message : "error";
  }
}

const corner = attempt(() => nav.height(EXPANSION01, CORNER.x, CORNER.y));
const route = attempt(() => nav.planGround(EXPANSION01, SPAWN, HALIS));
const kalimdor = walked(KALIMDOR, RAZOR_HILL, DUROTAR_TARGET, 30);
const northrend = walked(NORTHREND, BLEEDING_VALE, VENGEANCE_LANDING_ROAD, MIN_RIDE);
nav.close();
console.log(JSON.stringify({ corner, kalimdor, northrend, route }));
process.exit([corner, route, kalimdor, northrend].every((r) => r === "ok") ? 0 : 1);
