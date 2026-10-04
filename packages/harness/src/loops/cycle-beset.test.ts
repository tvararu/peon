import { expect, test } from "bun:test";
import { besetStop } from "#harness/loops/cycle-beset";

function skipped(guid: bigint, cause: string) {
  return { cause, guid, status: "skipped" as const };
}

test("a later skipped attacker stops the next pull", () => {
  const stop = besetStop(
    [skipped(40n, "target_unreachable"), skipped(41n, "target_unreachable")],
    [41n],
  );
  expect(stop).toMatchObject({
    cause: "attacker_unreachable",
    detail: { ref: 41n },
  });
});

test("no skipped attacker means no stop", () => {
  expect(besetStop([skipped(40n, "target_unreachable")], [])).toBeUndefined();
  expect(
    besetStop([skipped(40n, "target_unreachable")], [41n]),
  ).toBeUndefined();
  expect(besetStop([skipped(40n, "other")], [40n])).toBeUndefined();
});
