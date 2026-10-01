import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

type EmotesEvent = AreaEventOf<"emotes">;
type TextEmote = Extract<EmotesEvent, { type: "text_emote" }>;

function sentRow(event: TextEmote): AreaDraft {
  const target = event.target ?? "no one in particular";
  return {
    class: "log",
    data: { target: event.target, textEmote: event.textEmote },
    name: "sent",
    text: `You emoted ${event.textEmote} at ${target}.`,
  };
}

function onEvent(event: EmotesEvent): readonly AreaDraft[] {
  if (event.type === "text_emote" && event.self) return [sentRow(event)];
  return [];
}

export const emotesHarness = defineHarnessArea({
  area: "emotes",
  rules: () => ({ event: (event) => onEvent(event) }),
  worldActs: [],
});
