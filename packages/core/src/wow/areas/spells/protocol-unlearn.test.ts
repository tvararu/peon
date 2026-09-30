import { describe, expect, test } from "bun:test";
import { buildUnlearnSkill } from "#wow/areas/spells/protocol";
import { PacketReader } from "#wow/protocol/packet";

describe("CMSG_UNLEARN_SKILL", () => {
  test("writes one u32 skill id (SkillHandler.cpp:91-100)", () => {
    const body = buildUnlearnSkill(186);
    expect(Array.from(body)).toEqual([186, 0, 0, 0]);
    const reader = new PacketReader(body);
    expect(reader.uint32LE()).toBe(186);
    expect(reader.remaining).toBe(0);
  });
});
