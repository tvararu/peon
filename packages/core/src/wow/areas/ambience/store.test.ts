import { describe, expect, test } from "bun:test";
import { type AmbienceEvent, AmbienceStore } from "#wow/areas/ambience/store";

function storeWithEvents() {
  const store = new AmbienceStore();
  const seen: AmbienceEvent[] = [];
  store.onEvent((event) => seen.push(event));
  return { seen, store };
}

const RAIN = { abrupt: false, intensity: 0.5, state: 4 };

describe("AmbienceStore", () => {
  test("starts empty", () => {
    expect(new AmbienceStore().snapshot()).toEqual({
      states: [],
      weather: undefined,
    });
  });

  test("resetStates replaces every state", () => {
    const { seen, store } = storeWithEvents();
    store.resetStates([{ id: 1, value: 1 }]);
    store.resetStates([
      { id: 3191, value: -5 },
      { id: 2, value: 7 },
    ]);
    expect(store.snapshot().states).toEqual([
      { id: 2, value: 7 },
      { id: 3191, value: -5 },
    ]);
    expect(seen).toEqual([]);
  });

  test("setState sets one key and emits world_state with the previous value", () => {
    const { seen, store } = storeWithEvents();
    store.resetStates([
      { id: 2, value: 7 },
      { id: 5, value: 0 },
    ]);
    store.setState({ id: 2, value: -1 });
    store.setState({ id: 9, value: 3 });
    expect(store.snapshot().states).toEqual([
      { id: 2, value: -1 },
      { id: 5, value: 0 },
      { id: 9, value: 3 },
    ]);
    expect(seen).toEqual([
      { id: 2, previous: 7, type: "world_state", value: -1 },
      { id: 9, previous: undefined, type: "world_state", value: 3 },
    ]);
  });

  test("setWeather emits weather only when the state or the intensity changes", () => {
    const { seen, store } = storeWithEvents();
    store.setWeather(RAIN);
    store.setWeather({ ...RAIN, abrupt: true });
    store.setWeather({ ...RAIN, intensity: 0.75 });
    store.setWeather({ abrupt: false, intensity: 0.75, state: 106 });
    expect(store.snapshot().weather).toEqual({
      abrupt: false,
      intensity: 0.75,
      state: 106,
    });
    expect(seen).toEqual([
      { previous: undefined, type: "weather", weather: RAIN },
      {
        previous: { ...RAIN, abrupt: true },
        type: "weather",
        weather: { ...RAIN, intensity: 0.75 },
      },
      {
        previous: { ...RAIN, intensity: 0.75 },
        type: "weather",
        weather: { abrupt: false, intensity: 0.75, state: 106 },
      },
    ]);
  });

  test("clear empties the states and the weather", () => {
    const { store } = storeWithEvents();
    store.resetStates([{ id: 2, value: 7 }]);
    store.setWeather(RAIN);
    store.clear();
    expect(store.snapshot()).toEqual({ states: [], weather: undefined });
  });

  test("snapshot is detached from the store", () => {
    const { store } = storeWithEvents();
    store.resetStates([{ id: 2, value: 7 }]);
    store.setWeather(RAIN);
    const snapshot = store.snapshot();
    const first = snapshot.states[0];
    if (!(first && snapshot.weather)) throw new Error("empty snapshot");
    first.value = 0;
    snapshot.weather.state = 0;
    expect(store.snapshot()).toEqual({
      states: [{ id: 2, value: 7 }],
      weather: RAIN,
    });
  });
});
