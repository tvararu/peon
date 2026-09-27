import { expect, test } from "bun:test";
import { guardGitEnv } from "#tools/git-env-guard";

test("a clean command passes and keeps its exit code", async () => {
  expect(await guardGitEnv(["true"])).toEqual({ changed: [], code: 0 });
  expect(await guardGitEnv(["false"])).toEqual({ changed: [], code: 1 });
});

test("a command that writes config through the exported GIT_DIR fails", async () => {
  const result = await guardGitEnv(["git", "config", "peon.guard", "written"]);
  expect(result).toEqual({ changed: ["sandbox"], code: 1 });
});

test("the command runs with GIT_DIR and GIT_WORK_TREE on the sandbox", async () => {
  const result = await guardGitEnv([
    "sh",
    "-c",
    'case "$GIT_DIR" in */tmp/git-env-*/.git) [ "$GIT_WORK_TREE/.git" = "$GIT_DIR" ] ;; *) exit 3 ;; esac',
  ]);
  expect(result).toEqual({ changed: [], code: 0 });
});
