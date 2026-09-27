import { expect, test } from "bun:test";
import type { JevActionRequest } from "@peon/core";
import { selectJevAction } from "#harness/jev/select";
import {
  jsonResponse,
  request,
  validPayload,
} from "#test-support/jev-fixtures";

test("none framing variant produces byte-identical body to request without framing", async () => {
  let baselineBody = "";
  let noneBody = "";

  await selectJevAction(request, {
    apiKey: "ts_test_key",
    fetch: async (_, init) => {
      baselineBody = String(init?.body);
      return jsonResponse(200, validPayload);
    },
    signal: new AbortController().signal,
  });

  await selectJevAction(
    { ...request, framing: "none" },
    {
      apiKey: "ts_test_key",
      fetch: async (_, init) => {
        noneBody = String(init?.body);
        return jsonResponse(200, validPayload);
      },
      signal: new AbortController().signal,
    },
  );

  expect(noneBody).toBe(baselineBody);
  const parsed = JSON.parse(noneBody);
  expect(parsed.state.framing).toBeUndefined();
});

test("minimal framing variant includes observed level in state.framing", async () => {
  let capturedBody = "";
  const req: JevActionRequest = {
    ...request,
    characterClass: "Priest",
    framing: "minimal",
    observation: { self: { level: 10 } },
  };

  await selectJevAction(req, {
    apiKey: "ts_test_key",
    fetch: async (_, init) => {
      capturedBody = String(init?.body);
      return jsonResponse(200, validPayload);
    },
    signal: new AbortController().signal,
  });

  const parsed = JSON.parse(capturedBody);
  expect(parsed.state.framing).toBe(
    "In World of Warcraft 3.3.5a, you are a level 10 Priest fighting a hostile creature.",
  );
  expect(parsed.state.standingInstruction).toBe(req.instruction);
  expect(parsed.questions.action.instructions).toBe(
    "Which currently legal action best serves `standingInstruction`?",
  );
});

test("mechanics framing variant includes mechanics description in state.framing", async () => {
  let capturedBody = "";
  const req: JevActionRequest = {
    ...request,
    characterClass: "Priest",
    framing: "mechanics",
    observation: { self: { level: 12 } },
  };

  await selectJevAction(req, {
    apiKey: "ts_test_key",
    fetch: async (_, init) => {
      capturedBody = String(init?.body);
      return jsonResponse(200, validPayload);
    },
    signal: new AbortController().signal,
  });

  const parsed = JSON.parse(capturedBody);
  expect(parsed.state.framing).toBe(
    "In World of Warcraft 3.3.5a, you are a level 12 Priest fighting a hostile creature. The resource pool does not refill during the fight. Some actions apply effects over time. Some actions take time and can be disrupted.",
  );
});

test("uses endpointUrl option when provided", async () => {
  let capturedUrl = "";
  await selectJevAction(request, {
    apiKey: "ts_test_key",
    endpointUrl: "http://localhost:9999/custom",
    fetch: async (input) => {
      capturedUrl = String(input);
      return jsonResponse(200, validPayload);
    },
    signal: new AbortController().signal,
  });
  expect(capturedUrl).toBe("http://localhost:9999/custom");
});
