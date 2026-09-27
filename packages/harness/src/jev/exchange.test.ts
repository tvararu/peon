import { describe, expect, test } from "bun:test";
import type { JevActionRequest, JevExchange } from "#harness/jev/contract";
import { type JevActionOptions, selectJevAction } from "#harness/jev/select";
import {
  jsonResponse,
  request,
  validPayload,
} from "#test-support/jev-fixtures";

const API_KEY = "ts_secret_key_123";
const ENDPOINT = "https://user:pass@jev.example/v1/systemone";

type Fetch = NonNullable<JevActionOptions["fetch"]>;

async function exchangeOf(fetch: Fetch, signal = new AbortController().signal) {
  const recorded: JevExchange[] = [];
  const settled = await selectJevAction(request, {
    apiKey: API_KEY,
    endpointUrl: ENDPOINT,
    fetch,
    record: (exchange) => recorded.push(exchange),
    signal,
  }).then(
    () => "resolved",
    (error: Error) => error.message,
  );
  const rows = recorded.map((exchange) => JSON.stringify(exchange));
  return { exchange: recorded[0], rows, settled };
}

function cleanliness(rows: string[]) {
  return {
    count: rows.length,
    leaks: [API_KEY, "Bearer", "Authorization", ENDPOINT].filter((secret) =>
      rows.some((row) => row.includes(secret)),
    ),
  };
}

type Row = {
  candidates: { id: string; description: string }[];
  instruction: string;
  observation: Record<string, unknown>;
};

function rebuild(requestRow: Row, exchangeRow: JevExchange): string {
  const criteria = Object.fromEntries(
    requestRow.candidates.map(({ id, description }) => [id, description]),
  );
  const { framing, instructions, model } = exchangeRow;
  const state = {
    ...requestRow.observation,
    standingInstruction: requestRow.instruction,
    ...(framing === undefined ? {} : { framing }),
  };
  return JSON.stringify({
    model,
    questions: { action: { criteria, instructions, type: "choice" } },
    state,
  });
}

describe("each Jev call records one exchange", () => {
  test("an answer keeps the status and the whole response body", async () => {
    const { exchange, rows, settled } = await exchangeOf(async () =>
      jsonResponse(200, validPayload),
    );
    expect(cleanliness(rows)).toEqual({ count: 1, leaks: [] });
    expect(settled).toBe("resolved");
    expect(exchange).toMatchObject({ response: validPayload, status: 200 });
    expect(exchange?.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  test("a refused or failed HTTP answer keeps its status and body", async () => {
    const billing = { detail: { error_type: "billing_error" } };
    for (const [status, body] of [
      [402, billing],
      [503, { error: "overloaded" }],
      [400, "<html>bad</html>"],
    ] as const) {
      const { exchange, rows, settled } = await exchangeOf(async () =>
        typeof body === "string"
          ? new Response(body, { status })
          : jsonResponse(status, body),
      );
      expect(cleanliness(rows)).toEqual({ count: 1, leaks: [] });
      expect(settled).toContain(String(status));
      expect(exchange).toMatchObject({ response: body, status });
    }
  });

  test("an answer that is not JSON keeps the raw text", async () => {
    const { exchange, rows, settled } = await exchangeOf(
      async () => new Response("upstream timeout", { status: 200 }),
    );
    expect(cleanliness(rows)).toEqual({ count: 1, leaks: [] });
    expect(settled).toContain("json");
    expect(exchange).toMatchObject({
      response: "upstream timeout",
      status: 200,
    });
  });

  test("a network failure records the error without a status", async () => {
    const { exchange, rows, settled } = await exchangeOf(async () => {
      throw new TypeError("fetch failed");
    });
    expect(cleanliness(rows)).toEqual({ count: 1, leaks: [] });
    expect(settled).toContain("fetch failed");
    expect(exchange).toMatchObject({ error: "fetch failed" });
    expect(exchange).not.toHaveProperty("status");
  });

  test("an aborted call records the abort and its elapsed time", async () => {
    const controller = new AbortController();
    const fetch: Fetch = (_input, init) => {
      const { promise, reject } = Promise.withResolvers<Response>();
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError")),
      );
      controller.abort("jev_timeout");
      return promise;
    };
    const { exchange, rows } = await exchangeOf(fetch, controller.signal);
    expect(cleanliness(rows)).toEqual({ count: 1, leaks: [] });
    expect(exchange?.error).toContain("aborted");
    expect(exchange).not.toHaveProperty("status");
    expect(exchange?.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

test("the logged request and exchange rebuild the sent body byte for byte", async () => {
  const sent: string[] = [];
  const exchanges: JevExchange[] = [];
  const framed: JevActionRequest = {
    candidates: [
      { description: "Cast Arcane Shot at the target", id: "arcane_shot" },
      { description: "Do not start a new action", id: "wait" },
    ],
    characterClass: "hunter",
    framing: "mechanics",
    instruction: "defeat the selected target",
    observation: {
      "12": "numeric key",
      pet: { onTarget: true, target: "0xf1300000aa" },
      self: { health: 0.815, level: 10, name: "Ëlf" },
      skipped: undefined,
      unavailable: [{ id: "serpent_sting", reason: "out_of_range" }],
    },
  };
  await selectJevAction(framed, {
    apiKey: API_KEY,
    fetch: async (_input, init) => {
      sent.push(String(init?.body));
      return jsonResponse(200, {
        ...validPayload,
        answers: {
          action: {
            ...validPayload.answers.action,
            choice: "arcane_shot",
            probabilities: { arcane_shot: 0.7, wait: 0.3 },
          },
        },
      });
    },
    record: (recorded) => exchanges.push(recorded),
    signal: new AbortController().signal,
  });
  const logged = (row: object) => JSON.parse(JSON.stringify(row));
  const requestRow = logged({
    call: 1,
    runId: "r1",
    type: "request",
    ...framed,
    sentAtMs: 1,
    ts: 2,
  });
  const [exchange] = exchanges;
  if (exchange === undefined) throw new Error("no exchange recorded");
  expect(exchange.framing).toContain("level 10 hunter");
  expect(rebuild(requestRow, logged(exchange))).toBe(sent[0] ?? "");
});
