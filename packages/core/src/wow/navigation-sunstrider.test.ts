import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { createNavigation, type Navigation } from "#wow/navigation";

const dataPath = process.env["NAV_DATA"] ?? "";
const libraryPath = process.env["NAV_LIB"] ?? "";
const present =
  dataPath !== "" &&
  libraryPath !== "" &&
  existsSync(dataPath) &&
  existsSync(libraryPath);

describe.skipIf(!present)("Sunstrider Isle routes on navigation data", () => {
  let opened: Navigation | undefined;
  const nav = () => {
    opened ??= createNavigation({ dataPath, libraryPath });
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
});
