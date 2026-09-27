import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { scratchDir } from "@peon/core/test-support/scratch";
import { strayMessage, strayWorktree } from "#factory/repo-guard";

const core = "[core]\n\trepositoryformatversion = 0\n\tbare = false\n";
let repo = "";

beforeEach(async () => {
  repo = scratchDir("repo-guard");
  await mkdir(`${repo}/.git`);
  await writeFile(`${repo}/.git/config`, core);
});

afterEach(async () => {
  await rm(repo, { force: true, recursive: true });
});

describe("strayWorktree", () => {
  test("is null when core.worktree is unset", async () => {
    expect(await strayWorktree(repo)).toBeNull();
  });

  test("returns the value when core.worktree is set", async () => {
    await writeFile(`${repo}/.git/config`, `${core}\tworktree = /wt/run-26\n`);
    expect(await strayWorktree(repo)).toBe("/wt/run-26");
  });

  test("the message names the value and the unset command", () => {
    const message = strayMessage("/wt/run-26", "/r");
    expect(message).toContain(
      "git config --file /r/.git/config --unset core.worktree",
    );
  });
});
