import { homedir } from "node:os";
import { join } from "node:path";

export type AreaNames = Record<string, string>;

type Block = { names: AreaNames; versions: string[] };
type Scan = { blocks: Block[]; id?: string };

const WOWM = "code/wow_messages/wow_message_parser/wowm/world/enums/area.wowm";
const OUTPUT = "packages/core/src/wow/data/area-names.json";
const ENUM_START = /^enum Area : u32 \{$/;
const ENTRY = /^\s+[A-Z0-9_]+ = (\d+)(?: \{|;)$/;
const DISPLAY = /^\s+display = "(.*)";$/;
const VERSIONS = /^\s+versions = "([^"]*)";$/;
const SPACES = /\s+/;

export function parseAreaNames(text: string, version = "3.3.5"): AreaNames {
  const block = areaBlocks(text).find((b) => b.versions.includes(version));
  if (!block) throw new Error(`no Area enum for version ${version}`);
  return block.names;
}

function areaBlocks(text: string): Block[] {
  const scan: Scan = { blocks: [] };
  for (const line of text.split("\n")) scanLine(scan, line);
  return scan.blocks;
}

function scanLine(scan: Scan, line: string): void {
  if (ENUM_START.test(line)) scan.blocks.push({ names: {}, versions: [] });
  const block = scan.blocks.at(-1);
  if (!block) return;
  const entry = ENTRY.exec(line);
  const display = DISPLAY.exec(line);
  const versions = VERSIONS.exec(line);
  if (entry) scan.id = entry[1];
  if (display && scan.id !== undefined) block.names[scan.id] = display[1] ?? "";
  if (versions) block.versions = (versions[1] ?? "").split(SPACES);
}

async function main(): Promise<void> {
  const [input = join(homedir(), WOWM), output = OUTPUT] = Bun.argv.slice(2);
  const names = parseAreaNames(await Bun.file(input).text());
  await Bun.write(output, `${JSON.stringify(names, null, 2)}\n`);
  console.log(`${Object.keys(names).length} area names written to ${output}`);
}

if (import.meta.main) await main();
