import { describe, expect, test } from "bun:test";
import { partyOperationName, partyResultName } from "#wow/areas/raid/names";

describe("party result and operation names", () => {
  test("name the results the raid handlers return", () => {
    expect(partyResultName(0)).toBe("ok");
    expect(partyResultName(14)).toBe("group_swap_failed");
    expect(partyResultName(25)).toBe("raid_disallowed_by_level");
    expect(partyResultName(30)).toBe("lfg_teleport_in_combat");
  });

  test("name the operations", () => {
    expect(partyOperationName(0)).toBe("invite");
    expect(partyOperationName(4)).toBe("swap");
  });

  test("an unknown code keeps its number", () => {
    expect(partyResultName(10)).toBe("result_10");
    expect(partyResultName(99)).toBe("result_99");
    expect(partyOperationName(3)).toBe("operation_3");
  });
});
