import { describe, expect, test } from "bun:test";
import { handlerNames, packetClasses, scopeText } from "#tools/cite-source";

const writer = `// SMSG_UNRELATED in a comment { brace
#include "Player.h"
#define WRAP(x) \\
    { x }

void Player::SendInitialPackets()
{
    if (IsInWorld())
    {
        auto send = [&](uint32 n) { return n; };
        const char* s = "{";
        data.Initialize(SMSG_LOGIN_SETTIMESPEED, 4 + 4 + 4);
    }
}

void ByteBuffer::AppendPackedTime(time_t time)
{
    append<uint32>(time);
}
`;

const header = `namespace WorldPackets
{
    namespace Query
    {
        class TimeQueryResponse final : public ServerPacket
        {
        public:
            TimeQueryResponse() : ServerPacket(SMSG_QUERY_TIME_RESPONSE, 4 + 4) {}

            WorldPacket const* Write() override;

            uint32 ServerTime;
            uint32 TimeResponse;
        };

        class TimeQuery final : public ClientPacket
        {
        public:
            TimeQuery(WorldPacket&& packet) : ClientPacket(CMSG_QUERY_TIME, std::move(packet)) {}

            void Read() override {};
        };
    }
}
`;

const opcodes = `void OpcodeTable::Initialize()
{
    /*0x042*/ DEFINE_SERVER_OPCODE_HANDLER(SMSG_LOGIN_SETTIMESPEED,          STATUS_NEVER);
    /*0x1CE*/ DEFINE_HANDLER(CMSG_QUERY_TIME,     STATUS_LOGGEDIN,   PROCESS_INPLACE,        &WorldSession::HandleTimeQueryOpcode      );
    /*0x001*/ DEFINE_HANDLER(CMSG_BOOTME,        STATUS_NEVER,      PROCESS_INPLACE,        &WorldSession::Handle_NULL                );
}
`;

describe("scopeText", () => {
  test("takes the outermost function around a nested line", () => {
    const text = scopeText(writer, 12);
    expect(text).toContain("void Player::SendInitialPackets()");
    expect(text).toContain("SMSG_LOGIN_SETTIMESPEED");
    expect(text).not.toContain("AppendPackedTime");
  });

  test("covers the signature line above the brace", () => {
    expect(scopeText(writer, 16)).toContain("append<uint32>(time);");
  });

  test("ignores braces in comments, strings and macros", () => {
    const text = scopeText(writer, 18);
    expect(text).toContain("AppendPackedTime");
    expect(text).not.toContain("SMSG_LOGIN_SETTIMESPEED");
  });

  test("takes the class around a member declaration", () => {
    const text = scopeText(header, 13);
    expect(text).toContain("class TimeQueryResponse");
    expect(text).toContain("SMSG_QUERY_TIME_RESPONSE");
    expect(text).not.toContain("CMSG_QUERY_TIME");
  });

  test("falls back to the line outside any function or type", () => {
    expect(scopeText(writer, 2)).toBe('#include "Player.h"');
  });
});

describe("handlerNames", () => {
  test("maps a client opcode to its session handler", () => {
    expect(handlerNames(opcodes)).toEqual({
      CMSG_QUERY_TIME: "HandleTimeQueryOpcode",
    });
  });
});

describe("packetClasses", () => {
  test("maps server and client packet classes to their opcodes", () => {
    expect(packetClasses(header)).toEqual({
      CMSG_QUERY_TIME: ["TimeQuery"],
      SMSG_QUERY_TIME_RESPONSE: ["TimeQueryResponse"],
    });
  });
});
