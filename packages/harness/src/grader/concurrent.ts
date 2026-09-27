import { readdir, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { isRecord } from "#harness/grader/exec";

export type ConcurrentRow = {
  run: string;
  role: "agent" | "partner";
  character: string;
};

const FILES = [
  ["agent", "names.json"],
  ["partner", "partner-names.json"],
] as const;

async function characterIn(file: string): Promise<string | undefined> {
  const handle = Bun.file(file);
  if (!(await handle.exists())) return undefined;
  const json: unknown = await handle.json();
  const character = isRecord(json) ? json["character"] : undefined;
  return typeof character === "string" ? character : undefined;
}

export async function writeConcurrent(runDir: string): Promise<void> {
  const round = dirname(runDir);
  const own = basename(runDir);
  const rows: ConcurrentRow[] = [];
  const runs = (await readdir(round, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== own)
    .map((entry) => entry.name)
    .sort();
  for (const run of runs)
    for (const [role, file] of FILES) {
      const character = await characterIn(`${round}/${run}/${file}`);
      if (character !== undefined) rows.push({ character, role, run });
    }
  await writeFile(
    `${runDir}/grader/concurrent.json`,
    `${JSON.stringify(rows, null, 2)}\n`,
  );
}
