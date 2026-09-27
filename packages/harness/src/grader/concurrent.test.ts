import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { LOWER_BOUND_NOTE, writeConcurrent } from "#harness/grader/concurrent";

async function runDir(
  round: string,
  name: string,
  files: Record<string, string>,
): Promise<string> {
  const dir = `${round}/${name}`;
  await mkdir(`${dir}/grader`, { recursive: true });
  for (const [file, character] of Object.entries(files))
    await writeFile(
      `${dir}/${file}`,
      JSON.stringify({ account: "FAC0123456789", character }),
    );
  return dir;
}

describe("writeConcurrent", () => {
  test("lists the other runs' characters as a timestamped lower bound", async () => {
    const round = await mkdtemp(`${tmpdir()}/round-`);
    const own = await runDir(round, "t0-self-state-1", { "names.json": "Own" });
    await runDir(round, "t0-who-is-near-1", {
      "names.json": "Agent",
      "partner-names.json": "Witness",
    });
    await runDir(round, "t4-quest-first-1", {});
    await writeConcurrent(own, "2026-09-27T05:00:00.000Z");
    expect(await Bun.file(`${own}/grader/concurrent.json`).json()).toEqual({
      listedAt: "2026-09-27T05:00:00.000Z",
      note: LOWER_BOUND_NOTE,
      runs: [
        { character: "Agent", role: "agent", run: "t0-who-is-near-1" },
        { character: "Witness", role: "partner", run: "t0-who-is-near-1" },
      ],
    });
  });
});
