import { createNavigation } from "../../packages/core/src/wow/navigation";
import { navigationSource } from "../../packages/harness/src/navigation/maps";

const EXPANSION01 = 530;
const CORNER = { x: 8733.333, y: -6666.666 };
const SPAWN = { x: 8735, y: -6685, z: 70.5 };
const HALIS = { x: 8731.69, y: -6656.5 };

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
const corner = attempt(() => nav.height(EXPANSION01, CORNER.x, CORNER.y));
const route = attempt(() => nav.planGround(EXPANSION01, SPAWN, HALIS));
nav.close();
console.log(JSON.stringify({ corner, route }));
process.exit(corner === "ok" && route === "ok" ? 0 : 1);
