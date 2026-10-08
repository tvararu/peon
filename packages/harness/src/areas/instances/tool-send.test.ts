import { test } from "bun:test";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import { dungeonTool } from "#harness/areas/instances/tool";
import { expectSendKind } from "#test-support/tool-harness";

test("the status verb asks the server for the lockout list", async () => {
  await withFakeTimers(async () => {
    const checking = expectSendKind(dungeonTool, { do: "status" });
    await elapse(8000);
    await checking;
  });
});
