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
      cinematic: undefined,
      movie: undefined,
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
    expect(store.snapshot()).toEqual({
      cinematic: undefined,
      movie: undefined,
      states: [],
      weather: undefined,
    });
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
      cinematic: undefined,
      movie: undefined,
      states: [{ id: 2, value: 7 }],
      weather: RAIN,
    });
  });

  test("startCinematic records the sequence unfinished and emits cinematic", () => {
    const { seen, store } = storeWithEvents();
    store.startCinematic({ at: 7, completed: false, sequenceId: 310 });
    expect(store.snapshot().cinematic).toEqual({
      at: 7,
      completed: false,
      sequenceId: 310,
    });
    expect(seen).toEqual([
      {
        cinematic: { at: 7, completed: false, sequenceId: 310 },
        previous: undefined,
        type: "cinematic",
      },
    ]);
  });

  test("completeCinematic marks the cinematic completed and emits it once", () => {
    const { seen, store } = storeWithEvents();
    store.completeCinematic();
    store.startCinematic({ at: 7, completed: false, sequenceId: 310 });
    seen.length = 0;
    store.completeCinematic();
    store.completeCinematic();
    expect(store.snapshot().cinematic).toEqual({
      at: 7,
      completed: true,
      sequenceId: 310,
    });
    expect(seen).toEqual([
      {
        cinematic: { at: 7, completed: true, sequenceId: 310 },
        previous: { at: 7, completed: false, sequenceId: 310 },
        type: "cinematic",
      },
    ]);
  });

  test("startMovie records the movie and emits movie, replacing the previous one", () => {
    const { seen, store } = storeWithEvents();
    store.startMovie({ at: 7, movieId: 44 });
    store.startMovie({ at: 9, movieId: 55 });
    expect(store.snapshot().movie).toEqual({ at: 9, movieId: 55 });
    expect(seen).toEqual([
      {
        movie: { at: 7, movieId: 44 },
        previous: undefined,
        type: "movie",
      },
      {
        movie: { at: 9, movieId: 55 },
        previous: { at: 7, movieId: 44 },
        type: "movie",
      },
    ]);
  });
});
