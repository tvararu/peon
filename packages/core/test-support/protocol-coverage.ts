import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { testStores } from "#test-support/session-fixtures";
import {
  AREA_NAMES,
  areaStubs,
  type LooseModule,
  looseModule,
  type StubEntry,
} from "#wow/areas/compose";
import { AREAS } from "#wow/areas/registry";
import { registerWorldHandlers } from "#wow/client-handlers";
import { GameOpcode } from "#wow/protocol/opcodes";
import { STUBS } from "#wow/protocol/stubs";
import { OpcodeDispatch } from "#wow/protocol/world";
import type { WorldConn } from "#wow/world-conn";
import { createWorldEvents } from "#wow/world-events";

export type Direction = "client" | "server" | "both";
export type Status = "dead" | "stub" | "handled" | "missing";
export type Live = "" | "not seen live";
export type CoverageArea = Pick<LooseModule, "name" | "opcodes">;

export type CoverageRow = {
  opcode: number;
  name: string;
  direction: Direction;
  status: Status;
  live: Live;
  area: string;
};

export type CoverageInput = {
  areas: readonly CoverageArea[];
  dispatch: OpcodeDispatch;
  sources: readonly string[];
  stubs: readonly StubEntry[];
};

export const REPO_ROOT = join(import.meta.dir, "../../..");
export const COVERAGE_INDEX = "docs/protocol-coverage.md";
export const COVERAGE_DIR = "docs/protocol-coverage";
const CORE = "core";

const SOURCE_ROOT = join(import.meta.dir, "../src");
const SOURCES = new Bun.Glob("**/*.ts");
const UNSCANNED = ["wow/protocol/opcodes.ts", "wow/protocol/stubs.ts"];
const NAMED = /GameOpcode\.([A-Z0-9_]+)/g;
const TC9 = /^TC9_/;
const STATUSES: readonly Status[] = ["dead", "stub", "handled", "missing"];

const INDEX_TEXT = [
  "# Protocol coverage",
  "",
  "Every `GameOpcode` and what core does with it, split by owner. Each",
  "code area's opcodes, the ones its `opcodes.ts` lists in `owns`, are in",
  "`docs/protocol-coverage/<area>.md`; the opcodes no area owns are in",
  "[core.md](protocol-coverage/core.md). `mise test` fails when a file is",
  "stale or has no owner; rewrite them all with `mise protocol:coverage`,",
  "which also prints the counts per area and in total. How an area claims",
  "its opcodes is in [protocol.md](protocol.md#add-an-area).",
  "",
  "Each row gives the opcode, its name, its direction and its status:",
  "",
  "- `dead`: in the owning area's `dead` list; the server never sends it",
  "  or never reads it.",
  "- `stub`: in `STUBS` or in the owning area's `stubs`.",
  "- `handled`: the world handlers register a real handler for it, or",
  "  core source outside the opcode table and `STUBS` names it (a sent",
  "  client opcode, an awaited reply).",
  "- `missing`: none of these.",
  "",
  "The live column reads `not seen live` for an opcode in the owning",
  "area's `unseen` list: a test built from the AzerothCore writer proves",
  "it, and no live run has shown it yet.",
  "",
].join("\n");

export async function coreSources(): Promise<string[]> {
  const files = [...SOURCES.scanSync(SOURCE_ROOT)].filter(
    (f) => !(f.endsWith(".test.ts") || UNSCANNED.includes(f)),
  );
  return await Promise.all(
    files.map((f) => Bun.file(join(SOURCE_ROOT, f)).text()),
  );
}

function direction(name: string): Direction {
  const bare = name.replace(TC9, "");
  if (bare.startsWith("CMSG_")) return "client";
  if (bare.startsWith("SMSG_")) return "server";
  return "both";
}

function ownerOf(areas: readonly CoverageArea[]) {
  const owners = new Map<string, CoverageArea>();
  for (const area of areas)
    for (const name of area.opcodes.owns) owners.set(name, area);
  return (name: string) => owners.get(name);
}

export function coverageRows(input: CoverageInput): CoverageRow[] {
  const owner = ownerOf(input.areas);
  const stubs = new Set(input.stubs.map(([opcode]) => opcode));
  const named = new Set(
    input.sources.flatMap((s) => [...s.matchAll(NAMED)].map((m) => m[1])),
  );
  const status = (name: string, opcode: number): Status => {
    const dead: readonly string[] = owner(name)?.opcodes.dead ?? [];
    if (dead.includes(name)) return "dead";
    if (stubs.has(opcode)) return "stub";
    if (input.dispatch.has(opcode) || named.has(name)) return "handled";
    return "missing";
  };
  const live = (name: string): Live => {
    const unseen: readonly string[] = owner(name)?.opcodes.unseen ?? [];
    return unseen.includes(name) ? "not seen live" : "";
  };
  return Object.entries(GameOpcode).map(([name, opcode]) => ({
    area: owner(name)?.name ?? CORE,
    direction: direction(name),
    live: live(name),
    name,
    opcode,
    status: status(name, opcode),
  }));
}

function hex(opcode: number): string {
  return `0x${opcode.toString(16).padStart(3, "0")}`;
}

function renderArea(area: string, rows: readonly CoverageRow[]): string {
  const table = rows.map(
    (r) =>
      `| \`${hex(r.opcode)}\` | \`${r.name}\` | ${r.direction} | ${r.status} | ${r.live} |`,
  );
  const owner =
    area === CORE
      ? "The opcodes no code area owns."
      : `The opcodes the \`${area}\` code area owns.`;
  return [
    `# Protocol coverage: ${area}`,
    "",
    `${owner} Generated by \`mise protocol:coverage\`; the`,
    "columns are explained in [the index](../protocol-coverage.md).",
    "",
    "| Opcode | Name | Direction | Status | Live |",
    "|---|---|---|---|---|",
    ...table,
    "",
  ].join("\n");
}

function areaFile(area: string): string {
  return `${COVERAGE_DIR}/${area}.md`;
}

export function renderCoverage(
  rows: readonly CoverageRow[],
  areas: readonly CoverageArea[],
): Map<string, string> {
  const names = [...areas.map((a) => a.name), CORE];
  if (areas.some((a) => a.name === CORE))
    throw new Error(`an area may not be named ${CORE}`);
  return new Map([
    [COVERAGE_INDEX, INDEX_TEXT],
    ...names.map((name): [string, string] => [
      areaFile(name),
      renderArea(
        name,
        rows.filter((r) => r.area === name),
      ),
    ]),
  ]);
}

export function projectCoverage(sources: readonly string[]) {
  const dispatch = new OpcodeDispatch();
  registerWorldHandlers(
    { dispatch, events: createWorldEvents() } as unknown as WorldConn,
    testStores(),
  );
  const areas = AREA_NAMES.map((name) => looseModule(AREAS[name]));
  const rows = coverageRows({
    areas,
    dispatch,
    sources,
    stubs: [...STUBS, ...areaStubs()],
  });
  return { files: renderCoverage(rows, areas), rows };
}

export function coverageCounts(rows: readonly CoverageRow[]): string[] {
  const line = (label: string, of: readonly CoverageRow[]) => {
    const counts = STATUSES.map(
      (s) => `${of.filter((r) => r.status === s).length} ${s}`,
    );
    const unseen = of.filter((r) => r.live !== "").length;
    return `${label}: ${of.length} opcodes, ${counts.join(", ")}, ${unseen} not seen live`;
  };
  const areas = [...new Set(rows.map((r) => r.area))].sort();
  return [
    ...areas.map((a) =>
      line(
        a,
        rows.filter((r) => r.area === a),
      ),
    ),
    line("total", rows),
  ];
}

async function main(): Promise<void> {
  const { files, rows } = projectCoverage(await coreSources());
  for (const [path, text] of files)
    await Bun.write(join(REPO_ROOT, path), text);
  for (const name of await readdir(join(REPO_ROOT, COVERAGE_DIR)))
    if (!files.has(`${COVERAGE_DIR}/${name}`))
      await unlink(join(REPO_ROOT, COVERAGE_DIR, name));
  for (const line of coverageCounts(rows)) console.log(line);
}

if (import.meta.main) await main();
