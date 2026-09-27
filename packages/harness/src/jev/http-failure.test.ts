import { expect, test } from "bun:test";
import { JevTransportError, JevUnavailableError } from "#harness/jev/failure";
import { selectJevAction } from "#harness/jev/select";
import { jsonResponse, request } from "#test-support/jev-fixtures";

function answering(response: () => Response) {
  return selectJevAction(request, {
    apiKey: "ts_test_key",
    fetch: async () => response(),
    signal: new AbortController().signal,
  });
}

test("a refused key names the error type from the response", async () => {
  const billing = {
    detail: { error_type: "billing_error", message: "no credits" },
  };
  const refused = answering(() => jsonResponse(402, billing));
  await expect(refused).rejects.toBeInstanceOf(JevUnavailableError);
  await expect(refused).rejects.toThrow(
    "jev_unavailable: HTTP 402 billing_error",
  );
  const auth = { detail: { error_type: "authentication_error" } };
  await expect(answering(() => jsonResponse(401, auth))).rejects.toThrow(
    "jev_unavailable: HTTP 401 authentication_error",
  );
});

test("a refused key without a readable body falls back to the status name", async () => {
  await expect(
    answering(() => new Response("<html>", { status: 403 })),
  ).rejects.toThrow("jev_unavailable: HTTP 403 forbidden");
});

test("server errors and rate limits are retryable transport failures", async () => {
  for (const status of [429, 500, 503]) {
    const failed = answering(() => jsonResponse(status, {}));
    await expect(failed).rejects.toBeInstanceOf(JevTransportError);
    await expect(failed).rejects.toThrow(`TypeSafe HTTP ${status}`);
  }
});

test("other client errors stay plain failures", async () => {
  const failed = answering(() => jsonResponse(422, {}));
  await expect(failed).rejects.toThrow("TypeSafe HTTP 422");
  await expect(failed).rejects.not.toBeInstanceOf(JevTransportError);
  await expect(failed).rejects.not.toBeInstanceOf(JevUnavailableError);
});
