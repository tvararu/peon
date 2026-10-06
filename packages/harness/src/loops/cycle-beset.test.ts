import { expect, test } from "bun:test";
import { besetStop } from "#harness/loops/cycle-beset";

function skipped(guid: bigint, cause: string) {
  return { cause, guid, status: "skipped" as const };
}

test("no skipped attacker means no stop", () => {
  expect(besetStop([skipped(40n, "target_unreachable")], [])).toBeUndefined();
  expect(
    besetStop([skipped(40n, "target_unreachable")], [41n]),
  ).toBeUndefined();
  expect(besetStop([skipped(40n, "other")], [40n])).toBeUndefined();
});
