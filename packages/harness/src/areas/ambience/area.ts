import type { AreaState } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

function cinematicRow(
  cinematic: NonNullable<AreaState<"ambience">["cinematic"]>,
): AreaDraft {
  return {
    class: "passive",
    data: { sequenceId: cinematic.sequenceId },
    name: "cinematic",
    text: "The intro cinematic started; Peon skipped it.",
  };
}

export const ambienceHarness = defineHarnessArea({
  area: "ambience",
  rules: () => ({
    attach: (state) =>
      state.cinematic?.completed ? [cinematicRow(state.cinematic)] : [],
    event: (event) => {
      if (event.type === "cinematic")
        return event.cinematic.completed ? [cinematicRow(event.cinematic)] : [];
      if (event.type === "movie")
        return [
          {
            class: "passive",
            data: { movieId: event.movie.movieId },
            name: "movie",
            text: `The server started movie ${event.movie.movieId}; Peon cannot show it.`,
          } satisfies AreaDraft,
        ];
      if (event.type === "phase_changed")
        return [
          {
            class: "log",
            data: { from: event.from, to: event.to },
            name: "phase",
            text: "Your phase changed. Some units and objects may appear or vanish.",
          } satisfies AreaDraft,
        ];
      return [];
    },
  }),
  worldActs: [],
});
