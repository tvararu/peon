import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

export const ambienceHarness = defineHarnessArea({
  area: "ambience",
  rules: () => ({
    event: (event) => {
      if (event.type === "cinematic")
        return event.cinematic.completed
          ? [
              {
                class: "passive",
                data: { sequenceId: event.cinematic.sequenceId },
                name: "cinematic",
                text: "The intro cinematic started; Peon skipped it.",
              } satisfies AreaDraft,
            ]
          : [];
      if (event.type === "movie")
        return [
          {
            class: "passive",
            data: { movieId: event.movie.movieId },
            name: "movie",
            text: `The server started movie ${event.movie.movieId}; Peon cannot show it.`,
          } satisfies AreaDraft,
        ];
      return [];
    },
  }),
  worldActs: [],
});
