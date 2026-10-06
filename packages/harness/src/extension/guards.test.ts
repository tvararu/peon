import { describe, expect, test } from "bun:test";
import { installGuards } from "#harness/extension/guards";
import { createFakePi } from "#test-support/fake-pi";

describe("installGuards", () => {
  test("refuses a user shell command", async () => {
    const fake = createFakePi();
    installGuards(fake.api);
    const [result] = await fake.emit({
      command: "ls",
      cwd: "/",
      excludeFromContext: false,
      type: "user_bash",
    });
    expect(result).toMatchObject({
      result: { cancelled: false, exitCode: 1, truncated: false },
    });
  });

  test("leaves /login to Pi's own command", () => {
    const fake = createFakePi();
    installGuards(fake.api);
    fake.ui.editor = "/login";
    expect(fake.typeRaw("\r")).toEqual([undefined]);
    expect(fake.ui.editor).toBe("/login");
  });
});
