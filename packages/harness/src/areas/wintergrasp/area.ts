import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

type WintergraspEvent = AreaEventOf<"wintergrasp">;

function expiryText(expiresAt: number): string {
  const seconds = Math.max(0, Math.round(expiresAt - Date.now() / 1000));
  return seconds > 0 ? ` Answer within ${seconds} seconds.` : "";
}

function onEvent(event: WintergraspEvent): readonly AreaDraft[] {
  if (event.type === "wg_queue_offered")
    return [
      {
        class: "wake",
        data: { battleId: event.battleId },
        name: "invited",
        text: "The Wintergrasp queue offers you a place. Call wintergrasp accept or decline.",
      },
    ];
  if (event.type === "wg_queued")
    return [
      {
        class: "log",
        data: { battleId: event.battleId, zone: event.zone },
        name: "queued",
        text: event.queued
          ? `You joined the Wintergrasp queue for zone ${event.zone}.`
          : "The Wintergrasp queue refused you.",
      },
    ];
  if (event.type === "wg_entry_offered")
    return [
      {
        class: "wake",
        data: { battleId: event.battleId },
        name: "invited",
        text: `The Wintergrasp battle invites you to war. Call wintergrasp accept or decline.${expiryText(event.expiresAt)}`,
      },
    ];
  if (event.type === "wg_entered")
    return [
      {
        class: "log",
        data: { battleId: event.battleId },
        name: "entered",
        progress: true,
        text: "You entered the Wintergrasp battle.",
      },
    ];
  if (event.type === "wg_ejected")
    return [
      {
        class: "log",
        data: { battleId: event.battleId, reason: event.reason },
        name: "left",
        text: `You left the Wintergrasp battle (${event.reason}).`,
      },
    ];
  return [];
}

export const wintergraspHarness = defineHarnessArea({
  area: "wintergrasp",
  rules: () => ({ event: (event) => onEvent(event) }),
  worldActs: ["answerQueue", "answerEntry", "exitQueue", "hearthAndResurrect"],
});
