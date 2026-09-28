import { describe, expect, test } from "bun:test";
import {
  type CiteResult,
  checkCitations,
  failed,
  formatReport,
  type Tree,
} from "#tools/cite-check";

const files: Record<string, string> = {
  "src/server/game/Entities/Player/Player.cpp": `void Player::SendInitialPackets()
{
    data.Initialize(SMSG_LOGIN_SETTIMESPEED, 4 + 4 + 4);
}
`,
  "src/server/game/Handlers/QueryHandler.cpp": `void WorldSession::HandleTimeQueryOpcode(WorldPackets::Query::TimeQuery& /*packet*/)
{
    SendTimeQueryResponse();
}
`,
  "src/server/game/Log.h": "int a;\n",
  "src/server/game/Server/Packets/QueryPackets.cpp": `WorldPacket const* WorldPackets::Query::TimeQueryResponse::Write()
{
    _worldPacket << ServerTime;
    return &_worldPacket;
}
`,
  "src/server/game/Server/Packets/QueryPackets.h": `namespace WorldPackets
{
    class TimeQueryResponse final : public ServerPacket
    {
    public:
        TimeQueryResponse() : ServerPacket(SMSG_QUERY_TIME_RESPONSE, 4 + 4) {}
        uint32 ServerTime;
    };
}
`,
  "src/server/game/Server/Protocol/Opcodes.cpp": `void OpcodeTable::Initialize()
{
    /*0x042*/ DEFINE_SERVER_OPCODE_HANDLER(SMSG_LOGIN_SETTIMESPEED, STATUS_NEVER);
    /*0x1CE*/ DEFINE_HANDLER(CMSG_QUERY_TIME, STATUS_LOGGEDIN, PROCESS_INPLACE, &WorldSession::HandleTimeQueryOpcode);
}
`,
  "src/server/shared/Log.h": "int b;\n",
  "src/server/shared/Packets/ByteBuffer.cpp": `void ByteBuffer::AppendPackedTime(time_t time)
{
    append<uint32>(time);
}
`,
};

const tree: Tree = {
  files: Object.keys(files),
  read: async (path) => files[path] ?? "",
};

const check = async (text: string) =>
  (await checkCitations([{ path: "time.md", text }], tree)).map((r) => [
    r.verdict,
    r.detail,
  ]);

describe("checkCitations", () => {
  test("passes when the enclosing function names the opcode", async () => {
    expect(
      await check(
        "- SMSG_LOGIN_SETTIMESPEED: `Entities/Player/Player.cpp:3`\n",
      ),
    ).toEqual([["ok", "names SMSG_LOGIN_SETTIMESPEED"]]);
  });

  test("passes when the function is the opcode's handler", async () => {
    expect(await check("- CMSG_QUERY_TIME: `QueryHandler.cpp:1-3`\n")).toEqual([
      ["ok", "names HandleTimeQueryOpcode"],
    ]);
  });

  test("passes when the scope is the opcode's packet class", async () => {
    expect(
      await check(
        "- SMSG_QUERY_TIME_RESPONSE: `QueryPackets.cpp:3`, `Server/Packets/QueryPackets.h:7`\n",
      ),
    ).toEqual([
      ["ok", "names TimeQueryResponse"],
      ["ok", "names SMSG_QUERY_TIME_RESPONSE"],
    ]);
  });

  test("passes a table line in the opcode table", async () => {
    expect(
      await check("| CMSG_QUERY_TIME | `Server/Protocol/Opcodes.cpp:4` |\n"),
    ).toEqual([["ok", "names CMSG_QUERY_TIME"]]);
  });

  test("checks an opcode table line on its own", async () => {
    expect(
      await check("| CMSG_QUERY_TIME | `Server/Protocol/Opcodes.cpp:3` |\n"),
    ).toEqual([
      [
        "mismatch",
        "line 3: /*0x042*/ DEFINE_SERVER_OPCODE_HANDLER(SMSG_LOGIN_SETTIMESPEED, STATUS_NEVER); names none of CMSG_QUERY_TIME",
      ],
    ]);
  });

  test("checks every line of a comma list", async () => {
    expect(
      await check("- CMSG_QUERY_TIME: `Server/Protocol/Opcodes.cpp:3,4`\n"),
    ).toEqual([
      [
        "mismatch",
        "line 3: /*0x042*/ DEFINE_SERVER_OPCODE_HANDLER(SMSG_LOGIN_SETTIMESPEED, STATUS_NEVER); names none of CMSG_QUERY_TIME",
      ],
    ]);
  });

  test("fails when the enclosing function names none of the opcodes", async () => {
    expect(
      await check("- SMSG_LOGIN_SETTIMESPEED: `ByteBuffer.cpp:1-3`\n"),
    ).toEqual([
      [
        "mismatch",
        "line 1: void ByteBuffer::AppendPackedTime(time_t time) names none of SMSG_LOGIN_SETTIMESPEED",
      ],
    ]);
  });

  test("fails a missing file, a line past the end and an ambiguous path", async () => {
    expect(
      await check("SMSG_A: `Nope.cpp:1`, `Player/Player.cpp:4-5`, `Log.h:1`\n"),
    ).toEqual([
      ["missing", "no such file in the checkout"],
      ["out_of_range", "the file has 4 lines"],
      ["ambiguous", "src/server/game/Log.h, src/server/shared/Log.h"],
    ]);
  });

  test("checks only the file and line when no opcode is bound", async () => {
    expect(await check("A helper: `ByteBuffer.cpp:3`\n")).toEqual([
      ["unbound", "no opcode in the same block"],
    ]);
  });
});

describe("report", () => {
  const result = (verdict: CiteResult["verdict"]): CiteResult => ({
    cited: "A.cpp:1",
    detail: "why",
    doc: "time.md",
    line: 4,
    verdict,
  });

  test("fails only on a broken citation", () => {
    expect(failed([result("ok"), result("unbound")])).toBe(false);
    expect(failed([result("ok"), result("mismatch")])).toBe(true);
  });

  test("prints one line per citation and the totals", () => {
    expect(formatReport([result("ok"), result("missing")])).toBe(
      "time.md:4 A.cpp:1 ok: why\ntime.md:4 A.cpp:1 missing: why\n2 citations: 1 ok, 0 unbound, 1 broken",
    );
  });

  test("reports no citations", () => {
    expect(formatReport([])).toBe("0 citations: 0 ok, 0 unbound, 0 broken");
  });
});
