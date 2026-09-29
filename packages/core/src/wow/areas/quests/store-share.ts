import { QuestShareResult } from "#wow/areas/quests/protocol";

export type ShareRow = { guid: bigint; result: number; at: number };
export type PushClose =
  | "complete"
  | "timed_out"
  | "group_changed"
  | "no_answer";
export type SharePush = {
  questId: number;
  at: number;
  status: "open" | PushClose;
  expected: readonly bigint[];
  results: ShareRow[];
};
export type ShareOffer = {
  from: bigint;
  questId: number;
  title: string;
  at: number;
};
export type ShareState = {
  push: SharePush | undefined;
  offer: ShareOffer | undefined;
  dropped: number;
};
export type ShareAnswer = "accept" | "decline" | "auto_accepted";
export type ShareChange =
  | { type: "pushed"; questId: number }
  | { type: "result"; questId: number; guid: bigint; result: number }
  | { type: "relayed"; questId: number; guid: bigint; result: number }
  | { type: "closed"; questId: number; reason: PushClose }
  | { type: "offered"; from: bigint; questId: number; title: string }
  | { type: "answered"; questId: number; answer: ShareAnswer }
  | { type: "expired"; scope: "offer"; questId: number }
  | { type: "share_complete"; from: bigint; questId: number };
export type ShareStep = { share: ShareState; changes: ShareChange[] };

export const EMPTY_SHARE: ShareState = {
  dropped: 0,
  offer: undefined,
  push: undefined,
};

const RELAYED: ReadonlySet<number> = new Set([
  QuestShareResult.ACCEPT_QUEST,
  QuestShareResult.DECLINE_QUEST,
]);

const isFinal = (result: number): boolean =>
  result !== QuestShareResult.SHARING_QUEST;

const settled = (push: SharePush, guid: bigint): boolean =>
  push.results.some((row) => row.guid === guid && isFinal(row.result));

const owesReply = (push: SharePush, guid: bigint): boolean =>
  !settled(push, guid) &&
  push.results.some(
    (row) => row.guid === guid && row.result === QuestShareResult.SHARING_QUEST,
  );

const everyoneAnswered = (push: SharePush): boolean =>
  push.expected.length > 0 &&
  push.expected.every((guid) => settled(push, guid));

const dropRelay = (share: ShareState): ShareStep => ({
  changes: [],
  share: { ...share, dropped: share.dropped + 1 },
});

export function beginPush(
  share: ShareState,
  questId: number,
  now: number,
  expected: readonly bigint[],
): ShareStep | undefined {
  if (share.push?.status === "open") return undefined;
  return {
    changes: [{ questId, type: "pushed" }],
    share: {
      ...share,
      push: {
        at: now,
        expected: [...expected],
        questId,
        results: [],
        status: "open",
      },
    },
  };
}

function withRow(share: ShareState, push: SharePush, row: ShareRow): ShareStep {
  const next: SharePush = { ...push, results: [...push.results, row] };
  const type = RELAYED.has(row.result) ? "relayed" : "result";
  const changes: ShareChange[] = [
    { guid: row.guid, questId: push.questId, result: row.result, type },
  ];
  if (!everyoneAnswered(next))
    return { changes, share: { ...share, push: next } };
  changes.push({ questId: push.questId, reason: "complete", type: "closed" });
  return {
    changes,
    share: { ...share, push: { ...next, status: "complete" } },
  };
}

export function receivePushResult(
  share: ShareState,
  guid: bigint,
  result: number,
  now: number,
): ShareStep {
  const { push } = share;
  if (push?.status !== "open") return dropRelay(share);
  if (RELAYED.has(result) && !owesReply(push, guid)) return dropRelay(share);
  return withRow(share, push, { at: now, guid, result });
}

export function closePush(
  share: ShareState,
  reason: "timed_out" | "group_changed" | "no_answer",
): ShareStep | undefined {
  const { push } = share;
  if (push?.status !== "open") return undefined;
  return {
    changes: [{ questId: push.questId, reason, type: "closed" }],
    share: { ...share, push: { ...push, status: reason } },
  };
}

export function openOffer(share: ShareState, offer: ShareOffer): ShareStep {
  return {
    changes: [
      {
        from: offer.from,
        questId: offer.questId,
        title: offer.title,
        type: "offered",
      },
    ],
    share: { ...share, offer },
  };
}

export function answerOffer(
  share: ShareState,
  answer: ShareAnswer,
): ShareStep | undefined {
  const { offer } = share;
  if (!offer) return undefined;
  return {
    changes: [{ answer, questId: offer.questId, type: "answered" }],
    share: { ...share, offer: undefined },
  };
}

export function expireOffer(share: ShareState): ShareStep | undefined {
  const { offer } = share;
  if (!offer) return undefined;
  return {
    changes: [{ questId: offer.questId, scope: "offer", type: "expired" }],
    share: { ...share, offer: undefined },
  };
}
