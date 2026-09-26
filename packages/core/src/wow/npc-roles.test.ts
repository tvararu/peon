import { expect, test } from "bun:test";
import { npcRoles } from "#wow/npc-roles";

test("npcRoles is not implemented yet", () => {
  expect(() => npcRoles(0x2)).toThrow("not_implemented");
});
