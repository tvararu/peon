import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { UpdateWorldState, Weather } from "#wow/areas/ambience/protocol";

export type AmbienceWorldState = { id: number; value: number };

export type AmbienceState = {
  states: AmbienceWorldState[];
  weather: Weather | undefined;
};

export type AmbienceEvent =
  | {
      type: "world_state";
      id: number;
      value: number;
      previous: number | undefined;
    }
  | { type: "weather"; weather: Weather; previous: Weather | undefined };

export class AmbienceStore {
  private readonly events = new Emitter<[AmbienceEvent]>();
  private states = new Map<number, number>();
  private weather: Weather | undefined;

  snapshot(): AmbienceState {
    return {
      states: [...this.states]
        .sort(([a], [b]) => a - b)
        .map(([id, value]) => ({ id, value })),
      weather: this.weather && { ...this.weather },
    };
  }

  onEvent(cb: (event: AmbienceEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  resetStates(list: readonly AmbienceWorldState[]): void {
    this.states = new Map(list.map(({ id, value }) => [id, value]));
  }

  setState(update: UpdateWorldState): void {
    const previous = this.states.get(update.id);
    this.states.set(update.id, update.value);
    this.events.emit({
      type: "world_state",
      id: update.id,
      value: update.value,
      previous,
    });
  }

  setWeather(weather: Weather): void {
    const previous = this.weather;
    this.weather = { ...weather };
    if (
      previous?.state === weather.state &&
      previous.intensity === weather.intensity
    )
      return;
    this.events.emit({ type: "weather", weather: { ...weather }, previous });
  }

  clear(): void {
    this.states = new Map();
    this.weather = undefined;
  }

  dispose(): void {
    this.events.clear();
    this.clear();
  }
}
