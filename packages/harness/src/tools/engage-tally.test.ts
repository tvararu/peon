import { expect, test } from "bun:test";
import { decisionKind } from "#harness/tools/engage-tally";

test("Jev decision cards name hunter actions by what they do", () => {
  expect(decisionKind("pet_attack")).toBe("attack");
  expect(decisionKind("spell:75:target")).toBe("spell");
  expect(decisionKind("attack")).toBe("attack");
  expect(decisionKind("stop_auto_shot")).toBe("wait");
});
