import { describe, expect, test } from "bun:test";
import { type GuardEvent, GuardStore } from "#wow/areas/guard/store";

function watch(store: GuardStore): GuardEvent[] {
  const seen: GuardEvent[] = [];
  store.onEvent((event) => seen.push(event));
  return seen;
}

describe("guard store", () => {
  test("every warden request is counted and only the first emits", () => {
    const store = new GuardStore();
    const seen = watch(store);
    expect(store.snapshot().warden).toEqual({
      active: false,
      requests: 0,
      firstSize: undefined,
    });
    store.receiveWardenRequest({ size: 20 });
    store.receiveWardenRequest({ size: 7 });
    expect(seen).toEqual([{ type: "warden_request", size: 20 }]);
    expect(store.snapshot().warden).toEqual({
      active: true,
      requests: 2,
      firstSize: 20,
    });
  });

  test("the redirect reply is kept and emitted", () => {
    const store = new GuardStore();
    const seen = watch(store);
    store.receiveRedirectReady({ code: 1, ok: false });
    expect(seen).toEqual([{ type: "redirect_ready", ok: false }]);
    expect(store.snapshot().redirect).toEqual({ code: 1, ok: false });
  });

  test("a notification is emitted with its text", () => {
    const store = new GuardStore();
    const seen = watch(store);
    store.receiveNotification("Permission denied");
    expect(seen).toEqual([{ type: "notification", text: "Permission denied" }]);
  });
});
