import { QuestShareResult } from "#wow/areas/quests/protocol";

export type ShareRow = { guid: bigint; result: number; at: number };
export type SharePush = {
  questId: number;
  at: number;
  status: "waiting" | "answered" | "no_answer";
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
  prior: readonly SharePush[];
};
export type ShareAnswer = "accept" | "decline" | "auto_accepted";
export type ShareChange =
  | { type: "pushed"; questId: number }
  | { type: "result"; questId: number; guid: bigint; result: number }
  | { type: "relayed"; questId: number; guid: bigint; result: number }
  | { type: "offered"; from: bigint; questId: number; title: string }
  | { type: "answered"; questId: number; answer: ShareAnswer }
  | { type: "expired"; scope: "push" | "offer"; questId: number }
  | { type: "share_complete"; from: bigint; questId: number };
export type ShareStep = { share: ShareState; changes: ShareChange[] };

export const EMPTY_SHARE: ShareState = {
  offer: undefined,
  prior: [],
  push: undefined,
};

const RELAYED: ReadonlySet<number> = new Set([
  QuestShareResult.ACCEPT_QUEST,
  QuestShareResult.DECLINE_QUEST,
]);
const awaitingReply = (push: SharePush): boolean =>
  push.results.some(
    (row) =>
      row.result === QuestShareResult.SHARING_QUEST &&
      !push.results.some(
        (other) => other.guid === row.guid && RELAYED.has(other.result),
      ),
  );

export function beginPush(
  share: ShareState,
  questId: number,
  now: number,
): ShareStep | undefined {
  if (share.push?.status === "waiting") return undefined;
  if (share.push && awaitingReply(share.push)) return undefined;
  if (share.prior.some(awaitingReply)) return undefined;
  const prior = share.push ? [...share.prior, share.push] : [...share.prior];
  return {
    changes: [{ questId, type: "pushed" }],
    share: {
      ...share,
      prior,
      push: { at: now, questId, results: [], status: "waiting" },
    },
  };
}

export function receivePushResult(
  share: ShareState,
  guid: bigint,
  result: number,
  now: number,
): ShareStep | undefined {
  const { push } = share;
  if (!push) return undefined;
  const row = { at: now, guid, result };
  const status = push.status === "waiting" ? "answered" : push.status;
  const type = RELAYED.has(result) ? "relayed" : "result";
  return {
    changes: [{ guid, questId: push.questId, result, type }],
    share: {
      ...share,
      push: { ...push, results: [...push.results, row], status },
    },
  };
}

export function expirePush(share: ShareState): ShareStep | undefined {
  const { push } = share;
  if (push?.status !== "waiting") return undefined;
  return {
    changes: [{ questId: push.questId, scope: "push", type: "expired" }],
    share: { ...share, push: { ...push, status: "no_answer" } },
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
