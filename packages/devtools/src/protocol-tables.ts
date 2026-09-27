import { homedir } from "node:os";
import { join } from "node:path";

type Version = {
  major: number;
  minor: number | null;
  patch: number | null;
  build: number | null;
};

type IrMessage = {
  name: string;
  object_type: { container_type_tag: string; opcode: number };
  tags: { version: { version_type: { versions: Version[] } } };
};

type IrField = {
  object_type: string;
  name: string;
  offset: number;
  size: number;
  data_type: { update_mask_type_tag: string };
};

export type Ir = {
  world: { messages: IrMessage[] };
  wrath_update_mask: IrField[];
};

export type FieldRow = {
  name: string;
  offset: number;
  size: number;
  type: string;
};

export type FieldTable = { name: string; rows: FieldRow[] };

const IR = "code/wow_messages/intermediate_representation.json";
const OPCODES_OUTPUT = "packages/core/src/wow/protocol/opcodes.ts";
const FIELDS_OUTPUT = "packages/core/src/wow/protocol/update-fields.ts";
const SIDE = /_(Client|Server)$/;
const LINE_WIDTH = 80;

const RENAMED: Record<string, string> = {
  CMSG_MESSAGECHAT: "CMSG_MESSAGE_CHAT",
  CMSG_SETSHEATHED: "CMSG_SET_SHEATHED",
  SMSG_MESSAGECHAT: "SMSG_MESSAGE_CHAT",
  SMSG_SERVER_MESSAGE: "SMSG_CHAT_SERVER_MESSAGE",
};

const CORE_OPCODES: Record<string, number> = {
  CMSG_ARENA_TEAM_CREATE: 0x03_48,
  CMSG_ARENA_TEAM_QUERY: 0x03_4b,
  CMSG_BATTLEFIELD_JOIN: 0x02_3e,
  CMSG_DECLINE_CHANNEL_INVITE: 0x04_10,
  MSG_MOVE_SET_COLLISION_HGT: 0x05_18,
  MSG_MOVE_SET_RUN_BACK_SPEED: 0x00_cf,
  MSG_MOVE_SET_RUN_SPEED: 0x00_cd,
  MSG_MOVE_SET_SWIM_BACK_SPEED: 0x00_d5,
  MSG_MOVE_SET_SWIM_SPEED: 0x00_d3,
  MSG_MOVE_SET_TURN_RATE: 0x00_d8,
  MSG_MOVE_SET_WALK_SPEED: 0x00_d1,
  SMSG_CHAT_NOT_IN_PARTY: 0x02_99,
  SMSG_HEALTH_UPDATE: 0x04_7f,
  SMSG_JOINED_BATTLEGROUND_QUEUE: 0x03_8a,
  SMSG_LOOT_ITEM_NOTIFY: 0x01_64,
  SMSG_REAL_GROUP_UPDATE: 0x03_97,
};

const TABLES: [objectType: string, name: string][] = [
  ["Object", "OBJECT_FIELDS"],
  ["Item", "ITEM_FIELDS"],
  ["Container", "CONTAINER_FIELDS"],
  ["Unit", "UNIT_FIELDS"],
  ["Player", "PLAYER_FIELDS"],
  ["GameObject", "GAMEOBJECT_FIELDS"],
  ["DynamicObject", "DYNAMICOBJECT_FIELDS"],
  ["Corpse", "CORPSE_FIELDS"],
];

const MOVED_FIELDS: Record<string, string> = {
  "Object.CREATED_BY": "GameObject",
};

const FIELD_TYPES: Record<string, string> = {
  ArrayOfStruct: "u32",
  Bytes: "bytes4",
  Float: "f32",
  Guid: "u64",
  GuidArrayUsingEnum: "u64",
  Int: "u32",
  TwoShort: "u16x2",
};

const CORE_FIELDS: Record<string, FieldRow[]> = {
  Player: [
    { name: "QUEST_LOG", offset: 158, size: 125, type: "u32" },
    { name: "INV_SLOT_HEAD", offset: 324, size: 46, type: "u64" },
    { name: "PACK_SLOT_1", offset: 370, size: 32, type: "u64" },
    { name: "KEYRING_SLOT_1", offset: 496, size: 64, type: "u64" },
    { name: "CURRENCYTOKEN_SLOT_1", offset: 560, size: 64, type: "u64" },
  ],
};

export function isWrath(v: Version): boolean {
  return (
    v.major === 3 &&
    (v.minor === null || v.minor === 3) &&
    (v.patch === null || v.patch === 5) &&
    (v.build === null || v.build === 12_340)
  );
}

export function gameOpcodes(ir: Ir): Map<string, number> {
  const byName = new Map<string, number>();
  for (const m of ir.world.messages) {
    if (!m.tags.version.version_type.versions.some(isWrath)) continue;
    const base = m.name.replace(SIDE, "");
    byName.set(RENAMED[base] ?? base, m.object_type.opcode);
  }
  for (const [name, opcode] of Object.entries(CORE_OPCODES)) {
    if (byName.has(name)) throw new Error(`${name} is in the IR now`);
    byName.set(name, opcode);
  }
  const byOpcode = new Map<number, string>();
  for (const [name, opcode] of byName) {
    const other = byOpcode.get(opcode);
    if (other) throw new Error(`${name} and ${other} share ${hex(opcode)}`);
    byOpcode.set(opcode, name);
  }
  return new Map([...byName].sort(([, a], [, b]) => a - b));
}

export function updateFields(ir: Ir): FieldTable[] {
  const rows = new Map<string, FieldRow[]>(TABLES.map(([t]) => [t, []]));
  for (const f of ir.wrath_update_mask) {
    const owner = MOVED_FIELDS[`${f.object_type}.${f.name}`] ?? f.object_type;
    const type = FIELD_TYPES[f.data_type.update_mask_type_tag];
    const table = rows.get(owner);
    if (!(type && table)) throw new Error(`unknown field ${owner}.${f.name}`);
    table.push({ name: f.name, offset: f.offset, size: f.size, type });
  }
  for (const [owner, extra] of Object.entries(CORE_FIELDS))
    rows.get(owner)?.push(...extra);
  return TABLES.map(([owner, name]) => ({
    name,
    rows: (rows.get(owner) ?? []).toSorted((a, b) => a.offset - b.offset),
  }));
}

function hex(opcode: number): string {
  return `0x${opcode.toString(16).padStart(3, "0")}`;
}

export function renderOpcodes(opcodes: Map<string, number>): string {
  const lines = [...opcodes].map(([name, op]) => `  ${name}: ${hex(op)},`);
  return `export const GameOpcode = {\n${lines.join("\n")}\n} as const;\n`;
}

function renderField(f: FieldRow): string {
  const props = [`offset: ${f.offset}`, `size: ${f.size}`, `type: "${f.type}"`];
  const line = `  ${f.name}: { ${props.join(", ")} },`;
  if (line.length <= LINE_WIDTH) return line;
  return `  ${f.name}: {\n${props.map((p) => `    ${p},\n`).join("")}  },`;
}

export function renderFields(tables: FieldTable[]): string {
  const types = [...new Set(Object.values(FIELD_TYPES))].toSorted();
  const def = `export type FieldDef = {\n  offset: number;\n  size: number;\n  type: ${types.map((t) => `"${t}"`).join(" | ")};\n};\n`;
  const blocks = tables.map(
    (t) =>
      `export const ${t.name} = {\n${t.rows.map(renderField).join("\n")}\n} as const satisfies Record<string, FieldDef>;\n`,
  );
  return [def, ...blocks].join("\n");
}

async function main(): Promise<void> {
  const [input = join(homedir(), IR)] = Bun.argv.slice(2);
  const ir: Ir = await Bun.file(input).json();
  const opcodes = gameOpcodes(ir);
  const tables = updateFields(ir);
  await Bun.write(OPCODES_OUTPUT, renderOpcodes(opcodes));
  await Bun.write(FIELDS_OUTPUT, renderFields(tables));
  const fields = tables.reduce((n, t) => n + t.rows.length, 0);
  console.log(`${opcodes.size} opcodes written to ${OPCODES_OUTPUT}`);
  console.log(`${fields} update fields written to ${FIELDS_OUTPUT}`);
}

if (import.meta.main) await main();
