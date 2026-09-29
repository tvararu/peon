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

const MAX_PRIOR = 16;

const replied = (push: SharePush, guid: bigint): boolean =>
  push.results.some((row) => row.guid === guid && RELAYED.has(row.result));

export function beginPush(
  share: ShareState,
  questId: number,
  now: number,
): ShareStep | undefined {
  if (share.push?.status === "waiting") return undefined;
  const prior = share.push ? [...share.prior, share.push] : [...share.prior];
  const kept = prior.filter(awaitingReply).slice(-MAX_PRIOR);
  return {
    changes: [{ questId, type: "pushed" }],
    share: {
      ...share,
      prior: kept,
      push: { at: now, questId, results: [], status: "waiting" },
    },
  };
}

const withRow = (push: SharePush, row: ShareRow): SharePush => ({
  ...push,
  results: [...push.results, row],
  status: push.status === "waiting" ? "answered" : push.status,
});

export function receivePushResult(
  share: ShareState,
  guid: bigint,
  result: number,
  now: number,
): ShareStep | undefined {
  const row = { at: now, guid, result };
  const type = RELAYED.has(result) ? "relayed" : "result";
  if (!share.push) return undefined;
  if (!RELAYED.has(result)) {
    return {
      changes: [{ guid, questId: share.push.questId, result, type }],
      share: { ...share, push: withRow(share.push, row) },
    };
  }
  const prior = [...share.prior];
  for (let index = prior.length - 1; index >= 0; index -= 1) {
    const candidate = prior[index] as SharePush;
    if (
      candidate.results.some(
        (entry) =>
          entry.guid === guid &&
          entry.result === QuestShareResult.SHARING_QUEST &&
          !replied(candidate, guid),
      )
    ) {
      const settled = withRow(candidate, row);
      prior[index] = settled;
      const kept = prior.filter(awaitingReply);
      return {
        changes: [{ guid, questId: settled.questId, result, type }],
        share: { ...share, prior: kept },
      };
    }
  }
  const { push } = share;
  if (
    push.results.some(
      (entry) =>
        entry.guid === guid &&
        entry.result === QuestShareResult.SHARING_QUEST &&
        !replied(push, guid),
    )
  ) {
    const settled = withRow(push, row);
    return {
      changes: [{ guid, questId: settled.questId, result, type }],
      share: { ...share, push: settled },
    };
  }
  const updated = withRow(share.push, row);
  return {
    changes: [{ guid, questId: updated.questId, result, type }],
    share: { ...share, push: updated },
  };
}

export function settlePushRequestItems(
  share: ShareState,
  guid: bigint,
): ShareStep | undefined {
  const push = share.push;
  if (
    !push ||
    replied(push, guid) ||
    !push.results.some(
      (row) =>
        row.guid === guid && row.result === QuestShareResult.SHARING_QUEST,
    )
  )
    return undefined;
  return {
    changes: [
      {
        guid,
        questId: push.questId,
        result: QuestShareResult.ACCEPT_QUEST,
        type: "relayed",
      },
    ],
    share: {
      ...share,
      push: withRow(push, {
        at: push.at,
        guid,
        result: QuestShareResult.ACCEPT_QUEST,
      }),
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
