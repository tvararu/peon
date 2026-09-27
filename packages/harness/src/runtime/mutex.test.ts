import { expect, test } from "bun:test";
import { createWorldMutex } from "#harness/runtime/mutex";

test("runs sends one at a time in call order", async () => {
  const mutex = createWorldMutex();
  const order: string[] = [];
  const gate = Promise.withResolvers<void>();
  const first = mutex.run(async () => {
    order.push("first:start");
    await gate.promise;
    order.push("first:end");
  });
  const second = mutex.run(() => order.push("second"));
  await Bun.sleep(1);
  expect(order).toEqual(["first:start"]);
  gate.resolve();
  await Promise.all([first, second]);
  expect(order).toEqual(["first:start", "first:end", "second"]);
});

test("a failed send rejects its caller and does not block the next one", async () => {
  const mutex = createWorldMutex();
  const failed = mutex.run(() => {
    throw new Error("socket closed");
  });
  await expect(failed).rejects.toThrow("socket closed");
  expect(await mutex.run(() => 7)).toBe(7);
});
