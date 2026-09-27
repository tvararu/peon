import { describe, expect, test } from "bun:test";
import {
  gameOpcodes,
  type Ir,
  renderFields,
  updateFields,
} from "#tools/protocol-tables";

type V = [major: number, minor: number | null, patch: number | null];

function message(name: string, opcode: number, versions: V[]) {
  return {
    name,
    object_type: { container_type_tag: "SMsg", opcode },
    tags: {
      version: {
        version_type: {
          versions: versions.map(([major, minor, patch]) => ({
            build: null,
            major,
            minor,
            patch,
          })),
        },
      },
    },
  };
}

function field(objectType: string, name: string, offset: number, tag: string) {
  return {
    data_type: { update_mask_type_tag: tag },
    name,
    object_type: objectType,
    offset,
    size: 1,
  };
}

function ir(parts: Partial<Ir>): Ir {
  return { world: { messages: [] }, wrath_update_mask: [], ...parts };
}

describe("gameOpcodes", () => {
  test("keeps only messages valid for 3.3.5", () => {
    const opcodes = gameOpcodes(
      ir({
        world: {
          messages: [
            message("SMSG_WRATH", 0x10, [[3, null, null]]),
            message("SMSG_PATCH", 0x11, [[3, 3, 5]]),
            message("SMSG_VANILLA", 0x12, [[1, 12, null]]),
            message("SMSG_OLDER_WRATH", 0x13, [[3, 3, 3]]),
          ],
        },
      }),
    );
    expect(opcodes.get("SMSG_WRATH")).toBe(0x10);
    expect(opcodes.get("SMSG_PATCH")).toBe(0x11);
    expect(opcodes.has("SMSG_VANILLA")).toBe(false);
    expect(opcodes.has("SMSG_OLDER_WRATH")).toBe(false);
  });

  test("names both sides of a MSG once and keeps core names", () => {
    const opcodes = gameOpcodes(
      ir({
        world: {
          messages: [
            message("MSG_RANDOM_ROLL_Client", 0x1_fb, [[3, null, null]]),
            message("MSG_RANDOM_ROLL_Server", 0x1_fb, [[3, null, null]]),
            message("SMSG_MESSAGECHAT", 0x96, [[3, null, null]]),
          ],
        },
      }),
    );
    expect(opcodes.get("MSG_RANDOM_ROLL")).toBe(0x1_fb);
    expect(opcodes.get("SMSG_MESSAGE_CHAT")).toBe(0x96);
    expect(opcodes.has("SMSG_MESSAGECHAT")).toBe(false);
    expect(opcodes.get("SMSG_HEALTH_UPDATE")).toBe(0x4_7f);
  });

  test("refuses two names for one opcode", () => {
    const clash = ir({
      world: {
        messages: [
          message("SMSG_A", 0x20, [[3, null, null]]),
          message("SMSG_B", 0x20, [[3, null, null]]),
        ],
      },
    });
    expect(() => gameOpcodes(clash)).toThrow("SMSG_B and SMSG_A share 0x020");
  });
});

describe("updateFields", () => {
  test("files the created-by field under game objects", () => {
    const tables = updateFields(
      ir({ wrath_update_mask: [field("Object", "CREATED_BY", 6, "Guid")] }),
    );
    const byName = new Map(tables.map((t) => [t.name, t.rows]));
    expect(byName.get("OBJECT_FIELDS")).toEqual([]);
    expect(byName.get("GAMEOBJECT_FIELDS")?.[0]).toEqual({
      name: "CREATED_BY",
      offset: 6,
      size: 1,
      type: "u64",
    });
  });

  test("adds the core names for player slices", () => {
    const player = updateFields(ir({})).find((t) => t.name === "PLAYER_FIELDS");
    expect(player?.rows.map((r) => r.name)).toContain("PACK_SLOT_1");
  });

  test("refuses an unknown field type", () => {
    const odd = ir({ wrath_update_mask: [field("Unit", "ODD", 6, "Quad")] });
    expect(() => updateFields(odd)).toThrow("unknown field Unit.ODD");
  });
});

describe("renderFields", () => {
  test("wraps a field that does not fit on one line", () => {
    const name = "A_VERY_LONG_FIELD_NAME_THAT_PUSHES_PAST_THE_LINE";
    const text = renderFields([
      {
        name: "UNIT_FIELDS",
        rows: [{ name, offset: 6, size: 1, type: "u32" }],
      },
    ]);
    expect(text).toContain(`  ${name}: {\n    offset: 6,\n`);
  });
});
