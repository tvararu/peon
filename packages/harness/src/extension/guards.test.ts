import { expect, test } from "bun:test";
import { installGuards } from "#harness/extension/guards";
import { createFakePi } from "#test-support/fake-pi";
import { createTestRuntime } from "#test-support/runtime-fixture";

test("refuses a user shell command", async () => {
  const { rt } = await createTestRuntime();
  const fake = createFakePi();
  installGuards(fake.api, rt);
  const [result] = await fake.emit({
    command: "ls",
    cwd: "/",
    excludeFromContext: false,
    type: "user_bash",
  });
  expect(result).toEqual({
    result: {
      cancelled: false,
      exitCode: 1,
      output: "Shell commands are off in the harness.",
      truncated: false,
    },
  });
});
