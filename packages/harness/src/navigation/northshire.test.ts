import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { createNavigation, type Navigation } from "@peon/core";
import { navigationSource } from "#harness/navigation/maps";

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

const mcBride = { x: -8902.59, y: -162.61, z: 81.94 };

describe.skipIf(!(present && patched()))(
  "Northshire Abbey routes on the patched library from mise namigator:build",
  () => {
    let opened: Navigation | undefined;
    const nav = () => {
      opened ??= createNavigation(
        navigationSource({ dataDir: dataPath, library: libraryPath }).open,
      );
      return opened;
    };
    afterAll(() => opened?.close());

    test("plans from the abbey steps to Marshal McBride", () => {
      const route = nav().plan(0, { x: -8950, y: -132.5, z: 83.5 }, mcBride);
      expect(route.points.at(-1)).toMatchObject({ x: mcBride.x, y: mcBride.y });
    });

    test("plans from the pose after unstick to Marshal McBride", () => {
      const route = nav().plan(0, { x: -8955.7, y: -126.8, z: 83.2 }, mcBride);
      expect(route.points.at(-1)).toMatchObject({ x: mcBride.x, y: mcBride.y });
    });
  },
);
