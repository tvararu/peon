import { describe, expect, test } from "bun:test";
import type { ComplaintsEvent } from "#wow/areas/complaints/store";
import { ComplaintStore } from "#wow/areas/complaints/store";

describe("ComplaintStore", () => {
  test("a received reply emits complaint_received with its code", () => {
    const store = new ComplaintStore();
    const seen: ComplaintsEvent[] = [];
    store.onEvent((event) => seen.push(event));
    store.received({ code: 0 });
    store.received({ code: 3 });
    expect(seen).toEqual([
      { type: "complaint_received", code: 0 },
      { type: "complaint_received", code: 3 },
    ]);
  });

  test("an unsubscribed listener and a disposed store hear nothing", () => {
    const store = new ComplaintStore();
    const seen: ComplaintsEvent[] = [];
    const off = store.onEvent((event) => seen.push(event));
    off();
    store.received({ code: 1 });
    const other: ComplaintsEvent[] = [];
    store.onEvent((event) => other.push(event));
    store.dispose();
    store.received({ code: 2 });
    expect(seen).toEqual([]);
    expect(other).toEqual([]);
  });
});
