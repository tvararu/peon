import { readdir, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { FILES, type Role } from "#harness/grader/accounts";
import { isRecord } from "#harness/grader/exec";

export type ConcurrentRow = { run: string; role: Role; character: string };

export type Concurrent = {
  listedAt: string;
  note: string;
  runs: ConcurrentRow[];
};

export const LOWER_BOUND_NOTE =
  "Lower bound: only runs of this round whose names files existed at listedAt. A run that created its accounts later is missing.";

async function characterIn(file: string): Promise<string | undefined> {
  const handle = Bun.file(file);
  if (!(await handle.exists())) return undefined;
  const json: unknown = await handle.json();
  const character = isRecord(json) ? json["character"] : undefined;
  return typeof character === "string" ? character : undefined;
}

export async function writeConcurrent(
  runDir: string,
  listedAt: string,
): Promise<void> {
  const round = dirname(runDir);
  const own = basename(runDir);
  const runs: ConcurrentRow[] = [];
  const names = (await readdir(round, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== own)
    .map((entry) => entry.name)
    .sort();
  for (const run of names)
    for (const role of ["agent", "partner"] as const) {
      const character = await characterIn(
        `${round}/${run}/${FILES[role].names}`,
      );
      if (character !== undefined) runs.push({ character, role, run });
    }
  const out: Concurrent = { listedAt, note: LOWER_BOUND_NOTE, runs };
  await writeFile(
    `${runDir}/grader/concurrent.json`,
    `${JSON.stringify(out, null, 2)}\n`,
  );
}
