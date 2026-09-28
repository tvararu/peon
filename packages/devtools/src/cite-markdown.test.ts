import { describe, expect, test } from "bun:test";
import { findCitations } from "#tools/cite-markdown";

const doc = (text: string) => findCitations({ path: "notes.md", text });

describe("findCitations", () => {
  test("reads a C++ path with a line range and binds the item's opcode", () => {
    expect(
      doc(
        "- `SMSG_LOGIN_SETTIMESPEED` (0x042): packed time.\n  Writer: `Entities/Player/Player.cpp:11803-11807`.\n",
      ),
    ).toEqual([
      {
        cited: "Entities/Player/Player.cpp:11803-11807",
        doc: "notes.md",
        line: 2,
        lines: [11_803, 11_804, 11_805, 11_806, 11_807],
        opcodes: ["SMSG_LOGIN_SETTIMESPEED"],
        path: "Entities/Player/Player.cpp",
      },
    ]);
  });

  test("reads comma lists and strips the checkout prefix", () => {
    const [citation] = doc(
      "CMSG_QUERY_TIME: `~/code/azerothcore-wotlk-playerbots/src/Opcodes.cpp:593,600-601`\n",
    );
    expect(citation?.path).toBe("src/Opcodes.cpp");
    expect(citation?.lines).toEqual([593, 600, 601]);
  });

  test("skips Peon sources and bare line continuations", () => {
    expect(doc("`client.ts:184` and `:167`, `area.wowm:3`\n")).toEqual([]);
  });

  test("binds opcodes per table row", () => {
    const rows = doc(
      "| op | writer |\n|---|---|\n| SMSG_A | `A.cpp:1` |\n| SMSG_B | `B.cpp:2` |\n",
    );
    expect(rows.map((c) => c.opcodes)).toEqual([["SMSG_A"], ["SMSG_B"]]);
  });

  test("does not bind across paragraphs or list items", () => {
    const found = doc(
      "SMSG_A is sent.\n\nSee `A.cpp:1`.\n- MSG_B\n- `B.h:2`\n",
    );
    expect(found.map((c) => c.opcodes)).toEqual([[], []]);
  });

  test("binds every opcode the block names", () => {
    const [citation] = doc(
      "`CMSG_QUERY_TIME` and `SMSG_QUERY_TIME_RESPONSE`: `QueryHandler.cpp:72`\n",
    );
    expect(citation?.opcodes).toEqual([
      "CMSG_QUERY_TIME",
      "SMSG_QUERY_TIME_RESPONSE",
    ]);
  });

  test("skips an opcode prefix pattern", () => {
    const [citation] = doc("`MSG_MOVE_*` sends: `Unit.cpp:1`\n");
    expect(citation?.opcodes).toEqual([]);
  });
});
