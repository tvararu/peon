import { expect, test } from "bun:test";
import { type JevActionOptions, selectJevAction } from "#harness/jev/select";
import {
  jsonResponse,
  request,
  validPayload,
} from "#test-support/jev-fixtures";

test("HTTP rejection remains a failure without retry", async () => {
  let calls = 0;
  const fetch: NonNullable<JevActionOptions["fetch"]> = async () => {
    calls += 1;
    return jsonResponse(529, { error: "overloaded" });
  };

  await expect(
    selectJevAction(request, {
      apiKey: "ts_test_key",
      fetch,
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow("TypeSafe HTTP 529");
  expect(calls).toBe(1);
});

test("network rejection remains a failure without retry", async () => {
  let calls = 0;
  const fetch: NonNullable<JevActionOptions["fetch"]> = async () => {
    calls += 1;
    throw new Error("ECONNRESET");
  };

  await expect(
    selectJevAction(request, {
      apiKey: "ts_test_key",
      fetch,
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow("ECONNRESET");
  expect(calls).toBe(1);
});

test("abort propagates and does not retry", async () => {
  const controller = new AbortController();
  let calls = 0;
  const fetch: NonNullable<JevActionOptions["fetch"]> = async (
    _input,
    init,
  ) => {
    calls += 1;
    const { promise, reject } = Promise.withResolvers<Response>();
    const fail = () =>
      reject(new DOMException("The operation was aborted.", "AbortError"));
    if (init?.signal?.aborted) fail();
    else init?.signal?.addEventListener("abort", fail, { once: true });
    return await promise;
  };

  const pending = selectJevAction(request, {
    apiKey: "ts_test_key",
    fetch,
    signal: controller.signal,
  });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toBe(1);
});

test("late 2xx after abort is not a successful Choice", async () => {
  const controller = new AbortController();
  const fetch: NonNullable<JevActionOptions["fetch"]> = async () => {
    controller.abort();
    return jsonResponse(200, validPayload);
  };

  await expect(
    selectJevAction(request, {
      apiKey: "ts_test_key",
      fetch,
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
});

test("missing API key fails without a network call", async () => {
  let calls = 0;
  const fetch: NonNullable<JevActionOptions["fetch"]> = async () => {
    calls += 1;
    return jsonResponse(200, validPayload);
  };

  await expect(
    selectJevAction(request, {
      apiKey: "",
      fetch,
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow("Missing TypeSafe API key");
  expect(calls).toBe(0);
});

test("missing probability keys and non-unit totals fail", async () => {
  for (const probabilities of [{ smite: 1 }, { smite: 0.2, wait: 0.3 }]) {
    await expect(
      selectJevAction(request, {
        apiKey: "ts_test_key",
        fetch: async () =>
          jsonResponse(200, {
            ...validPayload,
            answers: {
              action: { ...validPayload.answers.action, probabilities },
            },
          }),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("Malformed TypeSafe Choice response");
  }
});

test("body read failures retain raw causes without serializing them", async () => {
  const raw = {
    toJSON: () => {
      throw new Error("Raw cause serialized");
    },
  };
  const response = jsonResponse(200, {});
  Object.defineProperty(response, "text", {
    value: async () => {
      throw raw;
    },
  });
  await expect(
    selectJevAction(request, {
      apiKey: "ts_test_key",
      fetch: async () => response,
      signal: new AbortController().signal,
    }),
  ).rejects.toMatchObject({ cause: { error: raw, field: "json" } });
});
