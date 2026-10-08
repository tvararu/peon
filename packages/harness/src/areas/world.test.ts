import { describe, expect, test } from "bun:test";
import type { Unsubscribe, WorldHandle } from "@peon/core";
import { Emitter } from "@peon/core/lib/emitter";
import { areaViews } from "#harness/areas/world";

type ClockState = { readonly speed: number; readonly marks: number[] };
type ClockEvent = { readonly type: "synced"; readonly at: { t: number } };
type ClockView = {
  readonly state: () => ClockState;
  readonly onEvent: (cb: (event: ClockEvent) => void) => Unsubscribe;
};

const REGISTRY = {
  clock: { area: "clock" },
} as const;

function fixture() {
  const store: ClockState = { marks: [1, 2], speed: 0.01 };
  const events = new Emitter<[ClockEvent]>();
  const handle = {
    clock: {
      onEvent: (cb: (event: ClockEvent) => void) => events.subscribe(cb),
      state: () => store,
    },
  } as unknown as WorldHandle;
  return { events, handle, store };
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
