import { describe, expect, mock, test } from "bun:test";
import type { Unsubscribe, WorldHandle } from "@peon/core";
import { Emitter } from "@peon/core/lib/emitter";
import { areaActs, areaViews } from "#harness/areas/world";

type ClockState = { readonly speed: number; readonly marks: number[] };
type ClockEvent = { readonly type: "synced"; readonly at: { t: number } };
type ClockView = {
  readonly state: () => ClockState;
  readonly onEvent: (cb: (event: ClockEvent) => void) => Unsubscribe;
};

const REGISTRY = {
  clock: { area: "clock", worldActs: ["sync"] },
} as const;

function fixture() {
  const store: ClockState = { marks: [1, 2], speed: 0.01 };
  const events = new Emitter<[ClockEvent]>();
  const sync = mock(async (n: number) => n * 2);
  const hidden = mock(() => "hidden");
  const handle = {
    clock: {
      act: { hidden, sync },
      onEvent: (cb: (event: ClockEvent) => void) => events.subscribe(cb),
      state: () => store,
    },
  } as unknown as WorldHandle;
  return { events, handle, hidden, store, sync };
}

describe("areaViews", () => {
  test("state returns a frozen copy the caller cannot change", () => {
    const { handle, store } = fixture();
    const views = areaViews(REGISTRY, handle, () => undefined);
    const clock = (views as unknown as { clock: ClockView }).clock;
    const state = clock.state();
    expect(state).toEqual(store);
    expect(state).not.toBe(store);
    expect(() => Object.assign(state, { speed: 1 })).toThrow(TypeError);
    expect(() => state.marks.push(3)).toThrow(TypeError);
    expect(store).toEqual({ marks: [1, 2], speed: 0.01 });
  });

  test("onEvent forwards frozen events and each subscription goes through hold", () => {
    const { events, handle } = fixture();
    const held: Unsubscribe[] = [];
    const views = areaViews(REGISTRY, handle, (stop) => held.push(stop));
    const clock = (views as unknown as { clock: ClockView }).clock;
    const seen: ClockEvent[] = [];
    const off = clock.onEvent((event) => seen.push(event));
    events.emit({ at: { t: 5 }, type: "synced" });
    expect(seen).toEqual([{ at: { t: 5 }, type: "synced" }]);
    expect(Object.isFrozen(seen[0]?.at)).toBe(true);
    expect(held).toHaveLength(1);
    for (const release of held) release();
    events.emit({ at: { t: 6 }, type: "synced" });
    expect(seen).toHaveLength(1);
    off();
    off();
    expect(events.size).toBe(0);
  });
});

describe("areaActs", () => {
  test("only the listed world acts exist and each runs through guard", async () => {
    const { handle, hidden, sync } = fixture();
    const guarded: string[] = [];
    const acts = areaActs(
      REGISTRY,
      () => handle,
      <T>(act: () => Promise<T>) => {
        guarded.push("guard");
        return act();
      },
    );
    expect(await acts.clock.sync(21)).toBe(42);
    expect(sync).toHaveBeenCalledWith(21);
    expect(guarded).toEqual(["guard"]);
    expect(Object.keys(acts.clock)).toEqual(["sync"]);
    expect("hidden" in acts.clock).toBe(false);
    // @ts-expect-error
    expect(acts.clock.hidden).toBeUndefined();
    expect(hidden).not.toHaveBeenCalled();
  });

  test("a guard refusal stops the act before it reaches the handle", async () => {
    const { handle, sync } = fixture();
    const acts = areaActs(
      REGISTRY,
      () => handle,
      () => Promise.reject(new Error("not_owner")),
    );
    await expect(acts.clock.sync(1)).rejects.toThrow("not_owner");
    expect(sync).not.toHaveBeenCalled();
  });

  test("an act with no live handle refuses offline", async () => {
    const acts = areaActs(
      REGISTRY,
      () => undefined,
      (act) => act(),
    );
    await expect(acts.clock.sync(1)).rejects.toThrow("offline");
  });
});
