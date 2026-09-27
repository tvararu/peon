import { expect, test } from "bun:test";
import { jevPort } from "#harness/jev/port";
import { request } from "#test-support/jev-fixtures";

test("no TypeSafe key means no Jev provider", () => {
  expect(jevPort({})).toBeUndefined();
  expect(jevPort({ TYPESAFE_API_KEY: "" })).toBeUndefined();
});

test("JEV_FAULT wraps the provider and names the fault", async () => {
  const port = jevPort({ JEV_FAULT: "http:402", TYPESAFE_API_KEY: "key" });
  expect(port?.fault).toBe("http:402");
  const signal = new AbortController().signal;
  await expect(port?.select(request, { signal })).rejects.toThrow(
    "jev_unavailable: HTTP 402 payment_required",
  );
});

test("a malformed JEV_FAULT is refused even without a key", () => {
  expect(() => jevPort({ JEV_FAULT: "slow" })).toThrow("Unknown JEV_FAULT");
});
