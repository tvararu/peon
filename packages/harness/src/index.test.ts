import { expect, test } from "bun:test";

test("the harness resolves its own modules through #harness", async () => {
  const self = await import("#harness/index");
  expect(Object.keys(self)).toEqual([]);
});
