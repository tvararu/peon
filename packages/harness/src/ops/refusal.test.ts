import { describe, expect, test } from "bun:test";
import { Refusal } from "#harness/ops/refusal";

describe("Refusal", () => {
  test("carries the reason and detail in its message", () => {
    const refusal = new Refusal({
      detail: "r3 (engage) is still running.",
      next: 'stop(run: "r3")',
      reason: "busy",
    });
    expect(refusal).toBeInstanceOf(Error);
    expect(refusal.message).toBe("busy: r3 (engage) is still running.");
    expect(refusal.next).toBe('stop(run: "r3")');
  });

  test("defaults status to REFUSED and body to no lines", () => {
    const refusal = new Refusal({
      detail: "the game connection is down.",
      reason: "offline",
    });
    expect(refusal.status).toBe("REFUSED");
    expect(refusal.body).toEqual([]);
    expect(refusal.next).toBeUndefined();
    expect(refusal.options).toBeUndefined();
  });

  test("keeps a FAILED status, body lines and options", () => {
    const refusal = new Refusal({
      body: ["line"],
      detail: "x",
      options: { rows: 2 },
      reason: "died",
      status: "FAILED",
    });
    expect(refusal.status).toBe("FAILED");
    expect(refusal.body).toEqual(["line"]);
    expect(refusal.options).toEqual({ rows: 2 });
  });
});
