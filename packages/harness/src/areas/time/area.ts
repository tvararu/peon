import type { AreaEventOf, AreaState } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

type TimeState = AreaState<"time">;
type GameTime = NonNullable<TimeState["gameTime"]>;
type Source = "attach" | AreaEventOf<"time">["type"];

const pad = (n: number) => String(n).padStart(2, "0");

function stamp(t: GameTime): string {
  return `${t.year}-${pad(t.month)}-${pad(t.day)} ${pad(t.hour)}:${pad(t.minute)}`;
}

function resetText(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${pad(minutes)}m`;
}

function synced(state: TimeState, source: Source): AreaDraft[] {
  const withReset = source === "set_speed" ? undefined : state.dailyResetInSec;
  const parts = [
    state.gameTime && `Game time ${stamp(state.gameTime)}.`,
    withReset !== undefined && `Daily reset in ${resetText(withReset)}.`,
  ].filter((part) => typeof part === "string");
  if (parts.length === 0) return [];
  return [
    {
      class: "log",
      data: {
        ...(withReset !== undefined && {
          dailyResetInSec: withReset,
          serverTime: state.serverTime,
        }),
        gameTime: state.gameTime && stamp(state.gameTime),
        source,
        speed: state.speed,
      },
      name: "synced",
      text: parts.join(" "),
    },
  ];
}

export const timeHarness = defineHarnessArea({
  area: "time",
  rules: () => ({
    attach: (state) => synced(state, "attach"),
    event: (event) => synced(event.state, event.type),
  }),
  worldActs: ["query"],
});
