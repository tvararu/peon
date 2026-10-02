import type { AreaEventOf, AreaState } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";

type LfgEvent = AreaEventOf<"lfg">;
type LfgState = AreaState<"lfg">;

const QUEUE_ROW_MS = 60_000;

function statusLog(event: Extract<LfgEvent, { type: "status" }>): AreaDraft {
  return {
    class: "log",
    data: {
      previous: event.previous,
      source: event.source,
      status: event.status,
      updateType: event.updateType,
    },
    name: "status",
    text: statusLogText(event),
  };
}

function statusLogText(event: Extract<LfgEvent, { type: "status" }>): string {
  if (event.source === "search") return "Dungeon finder list updated.";
  if (event.status === "queued") return "Queued for the dungeon finder.";
  if (event.status === "proposal") return "A dungeon group is ready.";
  return "Left the dungeon finder queue.";
}

function status(
  event: Extract<LfgEvent, { type: "status" }>,
  memo: { lastQueueRow: number },
): AreaDraft[] {
  if (event.source === "search") return [statusLog(event)];
  if (event.status === "queued" && event.previous !== "queued")
    return [
      {
        class: "passive",
        data: { updateType: event.updateType },
        name: "queued",
        text: "Queued for the dungeon finder.",
      },
    ];
  if (
    event.status === "none" &&
    (event.previous === "queued" || event.previous === "proposal")
  ) {
    memo.lastQueueRow = 0;
    return [
      {
        class: "passive",
        data: { previous: event.previous, updateType: event.updateType },
        name: "left",
        text: "Left the dungeon finder queue.",
      },
    ];
  }
  if (event.status === event.previous) return [];
  return [statusLog(event)];
}

function joinResult(
  event: Extract<LfgEvent, { type: "join_result" }>,
): AreaDraft[] {
  if (event.reason !== "ok")
    return [
      {
        class: "passive",
        data: {
          reason: event.reason,
          result: event.result,
          state: event.state,
        },
        name: "refused",
        text: `The dungeon finder refused the queue request: ${event.reason}.`,
      },
    ];
  return [
    {
      class: "log",
      data: {
        reason: event.reason,
        result: event.result,
        state: event.state,
      },
      name: "join_result",
      text: "Joined the dungeon finder queue.",
    },
  ];
}

function queueWait(queuedTime: number): string {
  const waited = Math.max(0, queuedTime);
  return waited >= 60 ? `${Math.round(waited / 60)} min` : `${waited} s`;
}

function queue(
  event: Extract<LfgEvent, { type: "queue" }>,
  rc: RuleInput,
  memo: { lastQueueRow: number },
): AreaDraft[] {
  if (rc.now - memo.lastQueueRow < QUEUE_ROW_MS) return [];
  memo.lastQueueRow = rc.now;
  return [
    {
      class: "passive",
      data: { dungeon: event.dungeon, queuedTime: event.queuedTime },
      name: "queue",
      text: `Still waiting in the dungeon finder queue: ${queueWait(event.queuedTime)}.`,
    },
  ];
}

function roleCheck(
  event: Extract<LfgEvent, { type: "role_check" }>,
): AreaDraft[] {
  if (event.stateName === "initializing")
    return [
      {
        class: "wake",
        data: { state: event.state, stateName: event.stateName },
        name: "role_check",
        text: 'A role check started: answer with dungeon(do: "roles").',
      },
    ];
  return [
    {
      class: "log",
      data: { state: event.state, stateName: event.stateName },
      name: "role_check",
      text: "The role check changed.",
    },
  ];
}

function roleChosen(
  event: Extract<LfgEvent, { type: "role_chosen" }>,
): AreaDraft[] {
  return [
    {
      class: "log",
      data: { guid: `${event.guid}`, ready: event.ready, roles: event.roles },
      name: "role_chosen",
      text: "A party member answered the role check.",
    },
  ];
}

const PROPOSAL_TEXT: Readonly<Record<number, string>> = {
  0: "A dungeon group proposal is waiting for an answer.",
  1: "The dungeon group proposal failed.",
  2: "The dungeon group proposal succeeded.",
};

function proposal(event: Extract<LfgEvent, { type: "proposal" }>): AreaDraft[] {
  if (event.state === 0 && !event.selfAnswered)
    return [
      {
        class: "wake",
        data: {
          deadline: event.deadline,
          dungeon: event.dungeon,
          id: event.id,
          state: event.state,
        },
        name: "proposal",
        text: "A dungeon group proposal is waiting for an answer.",
      },
    ];
  return [
    {
      class: "log",
      data: { dungeon: event.dungeon, id: event.id, state: event.state },
      name: "proposal",
      text: PROPOSAL_TEXT[event.state] ?? "The dungeon group proposal changed.",
    },
  ];
}

function boot(event: Extract<LfgEvent, { type: "boot_vote" }>): AreaDraft[] {
  if (event.inProgress)
    return [
      {
        class: "wake",
        data: {
          agrees: event.agrees,
          deadline: event.deadline,
          inProgress: event.inProgress,
          needed: event.needed,
          victim: `${event.victim}`,
          votes: event.votes,
        },
        name: "boot_vote",
        text: `A kick vote is open: ${event.agrees} of ${event.needed} needed agree.`,
      },
    ];
  return [
    {
      class: "log",
      data: {
        agrees: event.agrees,
        inProgress: event.inProgress,
        needed: event.needed,
        victim: `${event.victim}`,
        votes: event.votes,
      },
      name: "boot_vote",
      text: "The kick vote ended.",
    },
  ];
}

function teleportDenied(
  event: Extract<LfgEvent, { type: "teleport_denied" }>,
): AreaDraft[] {
  return [
    {
      class: "passive",
      data: { code: event.code, reason: event.reason },
      name: "teleport_refused",
      text: `The dungeon teleport was denied: ${event.reason}.`,
    },
  ];
}

function offerContinue(
  event: Extract<LfgEvent, { type: "offer_continue" }>,
): AreaDraft[] {
  return [
    {
      class: "log",
      data: { entry: event.entry },
      name: "offer_continue",
      text: "The dungeon finder offers to fill the group again.",
    },
  ];
}

function reward(event: Extract<LfgEvent, { type: "reward" }>): AreaDraft[] {
  return [
    {
      class: "log",
      data: {
        dungeon: event.dungeon,
        itemCount: event.itemCount,
        money: event.money,
        randomDungeon: event.randomDungeon,
        xp: event.xp,
      },
      name: "reward",
      progress: true,
      text: `Dungeon reward: ${event.money} copper, ${event.xp} experience, ${event.itemCount} item${event.itemCount === 1 ? "" : "s"}.`,
    },
  ];
}

function rule(
  event: LfgEvent,
  rc: RuleInput,
  memo: { lastQueueRow: number },
): AreaDraft[] {
  switch (event.type) {
    case "status":
      return status(event, memo);
    case "dungeons":
      return [];
    case "join_result":
      return joinResult(event);
    case "queue":
      return queue(event, rc, memo);
    case "role_check":
      return roleCheck(event);
    case "role_chosen":
      return roleChosen(event);
    case "proposal":
      return proposal(event);
    case "boot_vote":
      return boot(event);
    case "teleport_denied":
      return teleportDenied(event);
    case "offer_continue":
      return offerContinue(event);
    case "reward":
      return reward(event);
    case "raid_list":
      return [];
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

function attach(state: LfgState): AreaDraft[] {
  if (state.status === "none" && state.available.length === 0) return [];
  const locked = state.locks.filter((l) => l.status !== 0);
  return [
    {
      class: "log",
      data: {
        available: state.available.length,
        locks: state.locks.length,
        status: state.status,
      },
      name: "status",
      text:
        state.status === "queued"
          ? `Queued for ${state.selected.length} dungeon${state.selected.length === 1 ? "" : "s"}.`
          : `Dungeon finder offers ${state.available.length} random dungeons; ${locked.length} locked.`,
    },
  ];
}

export const lfgHarness = defineHarnessArea({
  area: "lfg",
  rules: () => {
    const memo = { lastQueueRow: 0 };
    return {
      attach: (state) => attach(state),
      event: (event, rc) => rule(event, rc, memo),
    };
  },
  worldActs: [
    "requestDungeons",
    "requestPartyLocks",
    "requestStatus",
    "answerProposal",
    "join",
    "leave",
    "setComment",
    "setRoles",
    "teleport",
    "voteKick",
  ],
});
