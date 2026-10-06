import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText } from "#harness/events/rules";

type ArenaEvent = AreaEventOf<"arena">;
type TeamEvent = Extract<ArenaEvent, { type: "team_event" }>;
type Result = Extract<ArenaEvent, { type: "result" }>;

function teamEventText(event: TeamEvent): string {
  const [first, second, third] = event.strings;
  switch (event.name) {
    case "join":
      return `${first} joined ${second}.`;
    case "leave":
      return `${first} left ${second}.`;
    case "remove":
      return `${first} was kicked out of ${second} by ${third}.`;
    case "leader_is":
      return `${first} is the captain of ${second}.`;
    case "leader_changed":
      return `${first} made ${second} the new captain of ${third}.`;
    case "disbanded":
      return `${first} disbanded ${second}.`;
    default:
      return `Arena team update (${event.name}): ${event.strings.join(", ")}.`;
  }
}

function resultRow(event: Result): AreaDraft {
  if (event.result.ok)
    return {
      class: "log",
      data: { action: event.result.action, team: event.result.team },
      name: "result",
      text: `Arena ${event.result.action} confirmed${event.result.team ? ` for ${event.result.team}` : ""}.`,
    };
  return {
    class: "wake",
    data: { error: event.result.error, team: event.result.team },
    name: "refused",
    text: `The arena ${event.result.action} was refused (${event.result.error}).`,
  };
}

function onEvent(event: ArenaEvent): readonly AreaDraft[] {
  if (event.type === "invited")
    return [
      {
        class: "wake",
        data: { team: event.team },
        name: "invited",
        text: `${event.inviter} invites you to join the arena team ${event.team}.`,
      },
    ];
  if (event.type === "team_event")
    return [
      {
        class: "log",
        data: { event: event.name },
        name: "team_event",
        text: teamEventText(event),
      },
    ];
  if (event.type === "result") return [resultRow(event)];
  if (event.type === "arena_error")
    return [
      {
        class: "wake",
        data: event.arenaType === undefined ? {} : { type: event.arenaType },
        name: "arena_error",
        text:
          event.arenaType === undefined
            ? "You are not in an arena team."
            : `You are not in a ${event.arenaType}v${event.arenaType} arena team.`,
      },
    ];
  if (event.type === "queue") {
    const queued = event.queue.filter((row) => row.kind === "queued");
    if (queued.length === 0) return [];
    return [
      {
        class: "log",
        data: { slots: queued.map((row) => row.slot) },
        name: "queue",
        progress: true,
        text: `Queued for an arena skirmish (slot ${queued.map((row) => row.slot).join(", ")}).`,
      },
    ];
  }
  if (event.type === "queue_refused")
    return [
      {
        class: "wake",
        data: { result: event.result },
        name: "queue_refused",
        text: `The arena queue refused the join (${event.result}).`,
      },
    ];
  if (event.type === "unit_destroyed")
    return [
      {
        class: "log",
        data: { guid: guidText(event.guid) },
        guid: guidText(event.guid),
        name: "unit_destroyed",
        text: `A unit fell in the arena.`,
      },
    ];
  return [];
}

export const arenaHarness = defineHarnessArea({
  area: "arena",
  rules: () => ({ event: onEvent }),
  worldActs: [
    "refresh",
    "query",
    "roster",
    "invite",
    "accept",
    "decline",
    "leave",
    "remove",
    "disband",
    "setLeader",
    "inspect",
    "joinQueue",
    "leaveQueue",
  ],
});
