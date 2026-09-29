import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { UpdateWorldState, Weather } from "#wow/areas/ambience/protocol";

export type AmbienceWorldState = { id: number; value: number };

export type AmbienceState = {
  states: AmbienceWorldState[];
  weather: Weather | undefined;
  cinematic: { sequenceId: number; at: number; completed: boolean } | undefined;
  movie: { movieId: number; at: number } | undefined;
};

export type AmbienceEvent =
  | {
      type: "world_state";
      id: number;
      value: number;
      previous: number | undefined;
    }
  | { type: "weather"; weather: Weather; previous: Weather | undefined }
  | {
      type: "cinematic";
      cinematic: NonNullable<AmbienceState["cinematic"]>;
      previous: AmbienceState["cinematic"];
    }
  | {
      type: "movie";
      movie: NonNullable<AmbienceState["movie"]>;
      previous: AmbienceState["movie"];
    };

export class AmbienceStore {
  private readonly events = new Emitter<[AmbienceEvent]>();
  private readonly pending: AmbienceEvent[] = [];
  private readonly now: () => number;
  private emitting = false;
  private states = new Map<number, number>();
  private weather: Weather | undefined;
  private cinematic: AmbienceState["cinematic"];
  private movie: AmbienceState["movie"];

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  snapshot(): AmbienceState {
    return {
      states: [...this.states]
        .sort(([a], [b]) => a - b)
        .map(([id, value]) => ({ id, value })),
      weather: this.weather && { ...this.weather },
      cinematic: this.cinematic && { ...this.cinematic },
      movie: this.movie && { ...this.movie },
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
    this.queue({
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
    this.queue({ type: "weather", weather: { ...weather }, previous });
  }

  startCinematic(cinematic: {
    sequenceId: number;
    completed: boolean;
    at?: number;
  }): void {
    const current = { ...cinematic, at: cinematic.at ?? this.now() };
    const previous = this.cinematic;
    this.cinematic = current;
    this.queue({
      type: "cinematic",
      cinematic: { ...current },
      previous,
    });
  }

  completeCinematic(): void {
    if (!this.cinematic || this.cinematic.completed) return;
    const previous = { ...this.cinematic };
    this.cinematic = { ...this.cinematic, completed: true };
    this.queue({
      type: "cinematic",
      cinematic: { ...this.cinematic },
      previous,
    });
  }

  startMovie(movie: { movieId: number; at?: number }): void {
    const current = { ...movie, at: movie.at ?? this.now() };
    const previous = this.movie;
    this.movie = current;
    this.queue({
      type: "movie",
      movie: { ...current },
      previous,
    });
  }

  clear(): void {
    this.states = new Map();
    this.weather = undefined;
    this.cinematic = undefined;
    this.movie = undefined;
  }

  private queue(event: AmbienceEvent): void {
    if (this.emitting) {
      this.pending.push(event);
      return;
    }
    this.emitting = true;
    try {
      this.events.emit(event);
      let next = this.pending.shift();
      while (next) {
        this.events.emit(next);
        next = this.pending.shift();
      }
    } finally {
      this.emitting = false;
    }
  }

  dispose(): void {
    this.events.clear();
    this.clear();
  }
}
