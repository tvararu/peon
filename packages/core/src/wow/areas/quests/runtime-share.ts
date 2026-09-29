import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildPushQuestToParty,
  buildQuestPushResult,
  QuestShareResult,
} from "#wow/areas/quests/protocol";
import type { QuestsEvent, QuestsStore } from "#wow/areas/quests/store";
import type { ShareChange, ShareOffer } from "#wow/areas/quests/store-share";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const PUSH_TIMEOUT_MS = 3000;
export const OFFER_TIMEOUT_MS = 60_000;

export type ShareStart =
  | { ok: true }
  | { ok: false; reason: "not_in_log" | "not_in_group" | "in_flight" };

export type ShareActs = {
  shareQuest: (questId: number) => ShareStart;
  answerShare: (answer: "accept" | "decline") => boolean;
};

type Timer = ReturnType<typeof setTimeout>;

type ShareTimers = { dispose: () => void };

function sendDecline(
  ctx: AreaRuntimeCtx<QuestsEvent>,
  offer: ShareOffer,
): void {
  ctx.send(
    GameOpcode.MSG_QUEST_PUSH_RESULT,
    buildQuestPushResult(
      offer.from,
      offer.questId,
      QuestShareResult.DECLINE_QUEST,
    ),
  );
}

function shareTimers(
  ctx: AreaRuntimeCtx<QuestsEvent>,
  store: QuestsStore,
): ShareTimers {
  let pushTimer: Timer | undefined;
  let offerTimer: Timer | undefined;
  const stopPush = (): void => {
    clearTimeout(pushTimer);
    pushTimer = undefined;
  };
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
  const startPush = (): void => {
    stopPush();
    pushTimer = setTimeout(() => {
      pushTimer = undefined;
      store.expirePush();
    }, PUSH_TIMEOUT_MS);
  };
  const startOffer = (): void => {
    stopOffer();
    offerTimer = setTimeout(expireOffer, OFFER_TIMEOUT_MS);
  };
  const onPush = (share: ShareChange): void => {
    if (share.type === "pushed") startPush();
    else if (share.type === "result" || share.type === "relayed") stopPush();
    else if (share.type === "expired" && share.scope === "push") stopPush();
  };
  const onOffer = (share: ShareChange): void => {
    if (share.type === "offered") startOffer();
    else if (share.type === "answered" && share.answer !== "auto_accepted")
      stopOffer();
    else if (share.type === "expired" && share.scope === "offer") stopOffer();
  };
  const off = store.onEvent((event) => {
    if (event.type !== "share") return;
    onPush(event.share);
    onOffer(event.share);
  });
  return {
    dispose: () => {
      off();
      stopPush();
      stopOffer();
    },
  };
}

export function shareRuntime(
  ctx: AreaRuntimeCtx<QuestsEvent>,
  store: QuestsStore,
  core: CoreStores,
): { act: ShareActs; dispose: () => void } {
  store.bindMembers((guid) =>
    ctx.legacy.party().members.some((member) => member.guid === guid),
  );
  const timers = shareTimers(ctx, store);
  const shareQuest = (questId: number): ShareStart => {
    const inLog =
      questId > 0 &&
      core.quests.snapshot().log.slots.some((slot) => slot.questId === questId);
    if (!inLog) return { ok: false, reason: "not_in_log" };
    if (!ctx.legacy.party().inGroup)
      return { ok: false, reason: "not_in_group" };
    if (!store.beginPush(questId)) return { ok: false, reason: "in_flight" };
    ctx.send(GameOpcode.CMSG_PUSHQUESTTOPARTY, buildPushQuestToParty(questId));
    return { ok: true };
  };
  const answerShare = (answer: "accept" | "decline"): boolean => {
    if (answer === "accept") throw new Error("answerShare accept is not built");
    const offer = store.snapshot().share?.offer;
    if (!offer) return false;
    sendDecline(ctx, offer);
    store.answerOffer("decline");
    return true;
  };
  return { act: { answerShare, shareQuest }, dispose: timers.dispose };
}
