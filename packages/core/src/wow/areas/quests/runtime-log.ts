import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildQuestgiverHello,
  buildQuestLogSwapQuest,
} from "#wow/areas/quests/protocol";
import type { QuestsEvent, QuestsStore } from "#wow/areas/quests/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const COMPLETED_QUERY_TIMEOUT_MS = 5000;

export type QuestLogActs = {
  queryCompleted: () => boolean;
  questgiverHello: (guid: bigint) => void;
  autoLaunch: () => void;
  swapLogSlots: (a: number, b: number) => boolean;
};

export function questLogRuntime(
  ctx: AreaRuntimeCtx<QuestsEvent>,
  store: QuestsStore,
  core: CoreStores,
): { act: QuestLogActs; dispose: () => void } {
  let pending = false;
  const queryCompleted = (): boolean => {
    if (pending) return false;
    pending = true;
    ctx.send(GameOpcode.CMSG_QUERY_QUESTS_COMPLETED);
    ctx
      .until((event) => event.type === "completed", {
        timeoutMs: COMPLETED_QUERY_TIMEOUT_MS,
      })
      .finally(() => {
        pending = false;
      })
      .catch(ignoreFailure);
    return true;
  };
  const offSelf = core.self.onEvent((event) => {
    if (event.type === "login_verified") queryCompleted();
  });
  const offQuest = ctx.listen("quest", (event) => {
    if (event.type === "rewarded" && event.questId !== undefined)
      store.addCompleted(event.questId);
  });
  const swapLogSlots = (a: number, b: number): boolean => {
    const body = buildQuestLogSwapQuest(a, b);
    if (!body) return false;
    ctx.send(GameOpcode.CMSG_QUESTLOG_SWAP_QUEST, body);
    return true;
  };
  return {
    act: {
      queryCompleted,
      questgiverHello: (guid) =>
        ctx.send(GameOpcode.CMSG_QUESTGIVER_HELLO, buildQuestgiverHello(guid)),
      autoLaunch: () => ctx.send(GameOpcode.CMSG_QUESTGIVER_QUEST_AUTOLAUNCH),
      swapLogSlots,
    },
    dispose: () => {
      offSelf();
      offQuest();
    },
  };
}
