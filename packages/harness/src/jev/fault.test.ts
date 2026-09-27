import { describe, expect, jest, test } from "bun:test";
import {
  type JevActionRequest,
  type JevActionResult,
  JevTransportError,
} from "@peon/core";
import {
  createFaultSelect,
  faultMarker,
  parseJevFault,
} from "#harness/jev/fault";
import { type JevHttpSelect, selectJevAction } from "#harness/jev/select";

const mockRequest: JevActionRequest = {
  candidates: [
    { description: "Wait", id: "wait" },
    { description: "Smite", id: "spell:585:target" },
  ],
  instruction: "defeat target",
  observation: { self: { level: 10 } },
};

const mockResult: JevActionResult = {
  choice: "spell:585:target",
  confidence: 0.9,
  elapsedMs: 250,
  inputTokens: 100,
  model: "jev-1.13.0",
  probabilities: { "spell:585:target": 1, wait: 0 },
};

describe("parseJevFault", () => {
  test("returns undefined when unset", () => {
    expect(parseJevFault(undefined)).toBeUndefined();
    expect(parseJevFault("")).toBeUndefined();
  });

  test("parses the three documented forms", () => {
    expect(parseJevFault("delay:2500")).toEqual({
      delayMs: 2500,
      kind: "delay",
    });
    expect(parseJevFault("http:503")).toEqual({ kind: "http", status: 503 });
    expect(parseJevFault("transport")).toEqual({ kind: "transport" });
  });

  test("limits a fault to one numbered request with @", () => {
    expect(parseJevFault("delay:6000@3")).toEqual({
      delayMs: 6000,
      kind: "delay",
      request: 3,
    });
    expect(faultMarker({ kind: "http", request: 2, status: 503 })).toBe(
      "http:503@2",
    );
  });

  test("rejects anything else", () => {
    for (const raw of [
      "delay",
      "delay:-1",
      "http:99",
      "http:200",
      "503",
      "network",
      "transport@0",
      "transport@",
      "transport@1@2",
      "delay:1@1.5",
    ])
      expect(() => parseJevFault(raw)).toThrow("Unknown JEV_FAULT");
  });
});

describe("faultMarker", () => {
  test("names each fault as the evidence records do", () => {
    expect(faultMarker({ delayMs: 2500, kind: "delay" })).toBe("delay:2500ms");
    expect(faultMarker({ kind: "http", status: 503 })).toBe("http:503");
    expect(faultMarker({ kind: "transport" })).toBe("transport:network");
  });
});

describe("createFaultSelect", () => {
  const options = () => ({
    apiKey: "key",
    signal: new AbortController().signal,
  });
  const base: JevHttpSelect = async (_request, { fetch }) => {
    await fetch?.("");
    return mockResult;
  };

  test("fails through the real client's HTTP classification", async () => {
    const busy = createFaultSelect(
      { kind: "http", status: 503 },
      selectJevAction,
    );
    await expect(busy(mockRequest, options())).rejects.toBeInstanceOf(
      JevTransportError,
    );
    const unpaid = createFaultSelect(
      { kind: "http", status: 402 },
      selectJevAction,
    );
    await expect(unpaid(mockRequest, options())).rejects.toThrow(
      "jev_unavailable: HTTP 402 payment_required",
    );
  });

  test("throws transport error", async () => {
    const select = createFaultSelect({ kind: "transport" }, selectJevAction);
    await expect(select(mockRequest, options())).rejects.toThrow(
      "fetch failed",
    );
  });

  test("faults only the numbered request", async () => {
    const select = createFaultSelect({ kind: "transport", request: 2 }, base);
    expect((await select(mockRequest, options())).choice).toBe(
      "spell:585:target",
    );
    await expect(select(mockRequest, options())).rejects.toThrow(
      "fetch failed",
    );
    expect((await select(mockRequest, options())).choice).toBe(
      "spell:585:target",
    );
  });

  test("holds the real result until the delay passes, even after abort", async () => {
    jest.useFakeTimers();
    try {
      const select = createFaultSelect({ delayMs: 1000, kind: "delay" }, base);
      const controller = new AbortController();
      let settled = false;
      const pending = select(mockRequest, {
        apiKey: "key",
        signal: controller.signal,
      }).then((result) => {
        settled = true;
        return result;
      });
      await Promise.resolve();
      await Promise.resolve();
      controller.abort();
      jest.advanceTimersByTime(900);
      await Promise.resolve();
      expect(settled).toBe(false);
      jest.advanceTimersByTime(100);
      expect((await pending).choice).toBe("spell:585:target");
    } finally {
      jest.useRealTimers();
    }
  });
});
