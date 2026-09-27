import { join } from "node:path";
import { registerWorldHandlers } from "#wow/client-handlers";
import { GameOpcode } from "#wow/protocol/opcodes";
import { STUBS } from "#wow/protocol/stubs";
import { OpcodeDispatch } from "#wow/protocol/world";
import type { WorldConn } from "#wow/world-conn";
import { createWorldEvents } from "#wow/world-events";

export type Direction = "client" | "server" | "both";
export type Status = "handled" | "stub" | "missing";

export type CoverageRow = {
  opcode: number;
  name: string;
  direction: Direction;
  status: Status;
};

export const COVERAGE_DOC = join(
  import.meta.dir,
  "../../../docs/protocol-coverage.md",
);

const SOURCE_ROOT = join(import.meta.dir, "../src");
const SOURCES = new Bun.Glob("**/*.ts");
const UNSCANNED = ["wow/protocol/opcodes.ts", "wow/protocol/stubs.ts"];
const NAMED = /GameOpcode\.([A-Z0-9_]+)/g;

export async function coreSources(): Promise<string[]> {
  const files = [...SOURCES.scanSync(SOURCE_ROOT)].filter(
    (f) => !(f.endsWith(".test.ts") || UNSCANNED.includes(f)),
  );
  return await Promise.all(
    files.map((f) => Bun.file(join(SOURCE_ROOT, f)).text()),
  );
}

function direction(name: string): Direction {
  if (name.startsWith("CMSG_")) return "client";
  if (name.startsWith("SMSG_")) return "server";
  return "both";
}

export function protocolCoverage(sources: string[]): CoverageRow[] {
  const dispatch = new OpcodeDispatch();
  registerWorldHandlers({
    dispatch,
    events: createWorldEvents(),
  } as unknown as WorldConn);
  const stubs = new Set(STUBS.map(([opcode]) => opcode));
  const named = new Set(
    sources.flatMap((s) => [...s.matchAll(NAMED)].map((m) => m[1])),
  );
  const status = (name: string, opcode: number): Status => {
    if (stubs.has(opcode)) return "stub";
    return dispatch.has(opcode) || named.has(name) ? "handled" : "missing";
  };
  return Object.entries(GameOpcode).map(([name, opcode]) => ({
    direction: direction(name),
    name,
    opcode,
    status: status(name, opcode),
  }));
}

export function renderCoverage(rows: CoverageRow[]): string {
  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const table = rows.map(
    (r) =>
      `| \`0x${r.opcode.toString(16).padStart(3, "0")}\` | \`${r.name}\` | ${r.direction} | ${r.status} |`,
  );
  return [
    "# Protocol coverage",
    "",
    "Every `GameOpcode` and what core does with it. `mise test` fails when",
    "this file is stale; rewrite it with",
    "`bun packages/core/test-support/protocol-coverage.ts`. How the status",
    "is decided is in [protocol.md](protocol.md#add-an-opcode).",
    "",
    `${rows.length} opcodes: ${count("handled")} handled, ${count("stub")} stub, ${count("missing")} missing.`,
    "",
    "| Opcode | Name | Direction | Status |",
    "|---|---|---|---|",
    ...table,
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const rows = protocolCoverage(await coreSources());
  await Bun.write(COVERAGE_DOC, renderCoverage(rows));
  console.log(`${rows.length} opcodes written to ${COVERAGE_DOC}`);
}

if (import.meta.main) await main();
