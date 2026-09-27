import { afterEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { scratchDir } from "@peon/core/test-support/scratch";
import { dbcDirectory } from "#harness/runtime/dbc-directory";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

test("reads a table's bytes from the directory, with or without a trailing slash", async () => {
  const dir = scratchDir("dbc-directory");
  dirs.push(dir);
  await Bun.write(join(dir, "Spell.dbc"), new Uint8Array([1, 2, 3]));
  expect(await dbcDirectory(dir)("Spell.dbc")).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  expect(await dbcDirectory(`${dir}/`)("Spell.dbc")).toEqual(
    new Uint8Array([1, 2, 3]),
  );
});

test("names the missing table and the directory", async () => {
  const dir = scratchDir("dbc-directory");
  dirs.push(dir);
  await expect(dbcDirectory(dir)("SpellRange.dbc")).rejects.toThrow(
    `missing SpellRange.dbc in ${dir}`,
  );
});
