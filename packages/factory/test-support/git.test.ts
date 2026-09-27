import { expect, test } from "bun:test";
import { gitEnv } from "#test-support/git";

test("gitEnv drops every GIT_ variable and keeps the rest", () => {
  expect(
    gitEnv({
      GIT_DIR: "/r/.git",
      GIT_WORK_TREE: "/r",
      HOME: "/h",
      X: undefined,
    }),
  ).toEqual({ HOME: "/h" });
});
