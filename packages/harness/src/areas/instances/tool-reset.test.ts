import { describe, expect, jest, test } from "bun:test";
import { dungeonSpec } from "#harness/areas/instances/tool";
import { Refusal } from "#harness/ops/refusal";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

describe("dungeon reset inside a dungeon", () => {
  test("a reset that failed for every map points at the hearthstone", async () => {
    const t = await createTestRuntime({});
    jest
      .spyOn(t.handle.instances.act, "resetInstances")
      .mockResolvedValue({ failed: [43], reset: [], status: "ok" });
    const error = await dungeonSpec.run({ do: "reset" }, toolCtx(t)).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    if (!(error instanceof Refusal)) throw new Error("no refusal");
    expect(error.reason).toBe("reset_failed");
    expect(error.next).toContain("travel");
    expect(error.next).toContain("hearth");
  });
});
