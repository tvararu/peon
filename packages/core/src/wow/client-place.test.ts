import { expect, test } from "bun:test";
import { placeMethods } from "#wow/client-place";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";

test("getPlaceState is not implemented yet", () => {
  const methods = placeMethods({} as WorldConn, {} as Runtimes);
  expect(() => methods.getPlaceState()).toThrow("not_implemented");
});
