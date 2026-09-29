import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildPushQuestToParty,
  buildQuestConfirmAccept,
  buildQuestPushResult,
  QuestShareResult,
} from "#wow/areas/quests/protocol";
import type { QuestsEvent, QuestsStore } from "#wow/areas/quests/store";
import type { ShareChange, ShareOffer } from "#wow/areas/quests/store-share";
import { GameOpcode } from "#wow/protocol/opcodes";
import { buildQuestgiverAcceptQuest } from "#wow/protocol/questgiver";
import type { CoreStores } from "#wow/session-stores";

export const PUSH_TIMEOUT_MS = 60_000;
export const FIRST_RESULT_TIMEOUT_MS = 3000;
export const OFFER_TIMEOUT_MS = 60_000;

export type ShareStart =
  | { ok: true }
  | { ok: false; reason: "not_in_log" | "not_in_group" | "busy" };

export type ShareActs = {
  shareQuest: (questId: number) => ShareStart;
  answerShare: (answer: "accept" | "decline") => boolean;
};

type Timer = ReturnType<typeof setTimeout>;

type ShareTimers = { dispose: () => void };

function sendAccept(ctx: AreaRuntimeCtx<QuestsEvent>, offer: ShareOffer): void {
  if (offer.kind === "confirm")
    ctx.send(
      GameOpcode.CMSG_QUEST_CONFIRM_ACCEPT,
      buildQuestConfirmAccept(offer.questId),
    );
  else
    ctx.send(
      GameOpcode.CMSG_QUESTGIVER_ACCEPT_QUEST,
      buildQuestgiverAcceptQuest(offer.from, offer.questId, 0),
    );
}

function sendDecline(
  ctx: AreaRuntimeCtx<QuestsEvent>,
  offer: ShareOffer,
): void {
  if (offer.kind === "confirm") return;
  ctx.send(
    GameOpcode.MSG_QUEST_PUSH_RESULT,
    buildQuestPushResult(
      offer.from,
      offer.questId,
      QuestShareResult.DECLINE_QUEST,
    ),
  );
}
type PushTimers = {
  stopPush: () => void;
  onPush: (share: ShareChange) => void;
};

function pushTimers(store: QuestsStore): PushTimers {
  let pushTimer: Timer | undefined;
  let firstResultTimer: Timer | undefined;
  const stopPush = (): void => {
    clearTimeout(pushTimer);
    clearTimeout(firstResultTimer);
    pushTimer = undefined;
    firstResultTimer = undefined;
  };
  const settleWindow = (): void => {
    firstResultTimer = undefined;
    if ((store.snapshot().share?.push?.results.length ?? 0) === 0)
      store.closePush("no_answer");
    else store.settlePushWindow();
  };
  const startPush = (): void => {
    stopPush();
    firstResultTimer = setTimeout(settleWindow, FIRST_RESULT_TIMEOUT_MS);
    pushTimer = setTimeout(() => {
      pushTimer = undefined;
      store.closePush("timed_out");
    }, PUSH_TIMEOUT_MS);
  };
  const onPush = (share: ShareChange): void => {
    if (share.type === "pushed") startPush();
    else if (share.type === "closed") stopPush();
  };
  return { onPush, stopPush };
}

function shareTimers(
  ctx: AreaRuntimeCtx<QuestsEvent>,
  store: QuestsStore,
): ShareTimers {
  const push = pushTimers(store);
  let offerTimer: Timer | undefined;
  const stopOffer = (): void => {
    clearTimeout(offerTimer);
    offerTimer = undefined;
  };
  const expireOffer = (): void => {
    offerTimer = undefined;
    const offer = store.snapshot().share?.offer;
    if (!offer) return;
    sendDecline(ctx, offer);
    store.expireOffer();
  };
  const startOffer = (): void => {
    stopOffer();
    offerTimer = setTimeout(expireOffer, OFFER_TIMEOUT_MS);
  };
  const onOffer = (share: ShareChange): void => {
    if (share.type === "offered") startOffer();
    else if (share.type === "answered" && share.answer !== "auto_accepted")
      stopOffer();
    else if (share.type === "expired") stopOffer();
  };
  const off = store.onEvent((event) => {
    if (event.type !== "share") return;
    push.onPush(event.share);
    onOffer(event.share);
  });
  return {
    dispose: () => {
      off();
      push.stopPush();
      stopOffer();
    },
  };
}

export function shareRuntime(
  ctx: AreaRuntimeCtx<QuestsEvent>,
  store: QuestsStore,
  core: CoreStores,
): { act: ShareActs; dispose: () => void } {
  const self = ctx.selfGuid();
  store.bindMembers(() =>
    ctx.legacy
      .party()
      .members.filter((member) => member.online && member.guid !== self)
      .map((member) => member.guid),
  );
  const timers = shareTimers(ctx, store);
  const offGroup = ctx.listen("group", (event) => {
    if (event.type !== "group_list") {
      if (event.type === "group_destroyed" || event.type === "kicked")
        store.closePush("group_changed");
      return;
    }
    if (
      event.change.formed ||
      event.change.added.length > 0 ||
      event.change.removed.length > 0
    )
      store.closePush("group_changed");
  });
  const shareQuest = (questId: number): ShareStart => {
    const inLog =
      questId > 0 &&
      core.quests.snapshot().log.slots.some((slot) => slot.questId === questId);
    if (!inLog) return { ok: false, reason: "not_in_log" };
    if (!ctx.legacy.party().inGroup)
      return { ok: false, reason: "not_in_group" };
    if (!store.beginPush(questId)) return { ok: false, reason: "busy" };
    try {
      ctx.send(
        GameOpcode.CMSG_PUSHQUESTTOPARTY,
        buildPushQuestToParty(questId),
      );
    } catch (error) {
      store.closePush("group_changed");
      throw error;
    }
    return { ok: true };
  };
  const answerShare = (answer: "accept" | "decline"): boolean => {
    const offer = store.snapshot().share?.offer;
    if (!offer) return false;
    if (answer === "decline") {
      sendDecline(ctx, offer);
      store.answerOffer("decline");
      return true;
    }
    sendAccept(ctx, offer);
    store.answerOffer("accept");
    return true;
  };
  const dispose = (): void => {
    offGroup();
    timers.dispose();
  };
  return { act: { answerShare, shareQuest }, dispose };
}
