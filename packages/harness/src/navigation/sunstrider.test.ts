import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { navigationSource } from "#harness/navigation/maps";
import { createNavigation, type Navigation } from "#harness/navigation/planner";

const dataPath = process.env["NAV_DATA"] ?? "";
const libraryPath = process.env["NAV_LIB"] ?? "";
const present =
  dataPath !== "" &&
  libraryPath !== "" &&
  existsSync(dataPath) &&
  existsSync(libraryPath);

function patched(): boolean {
  const nav = createNavigation(
    navigationSource({ dataDir: dataPath, library: libraryPath }).open,
  );
  try {
    nav.height(530, 8733.333, -6666.666);
    return true;
  } catch {
    return false;
  } finally {
    nav.close();
  }
}

describe.skipIf(!(present && patched()))(
  "Sunstrider Isle routes on the patched library from mise namigator:build",
  () => {
    let opened: Navigation | undefined;
    const nav = () => {
      opened ??= createNavigation(
        navigationSource({ dataDir: dataPath, library: libraryPath }).open,
      );
      return opened;
    };
    afterAll(() => opened?.close());

    test("plans from the Sunstrider court to the eastern path", () => {
      const route = nav().planGround(
        530,
        { x: 10_244, y: -6363, z: 30.84 },
        { x: 10_350, y: -6357 },
      );
      expect(route.points.at(-1)).toMatchObject({ x: 10_350, y: -6357 });
    });

    test("crosses the three-floor ramp east of the court on one floor", () => {
      const route = nav().planGround(
        530,
        { x: 10_272.2, y: -6410.8, z: 38.6 },
        { x: 10_350, y: -6357 },
      );
      expect(route.points.at(-1)).toMatchObject({ x: 10_350, y: -6357 });
    });
  },
);
