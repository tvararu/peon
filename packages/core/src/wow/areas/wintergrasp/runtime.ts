import type { AreaRuntime } from "#wow/areas/contract";
import {
  answerEntryActs,
  answerQueueActs,
} from "#wow/areas/wintergrasp/runtime-answer";
import { exitQueueActs } from "#wow/areas/wintergrasp/runtime-exit";
import { hearthActs } from "#wow/areas/wintergrasp/runtime-hearth";
import type { Ctx } from "#wow/areas/wintergrasp/runtime-shared";
import type { WintergraspActs } from "#wow/areas/wintergrasp/runtime-types";
import type { WintergraspStore } from "#wow/areas/wintergrasp/store";
import type { CoreStores } from "#wow/session-stores";

export type { WintergraspActs } from "#wow/areas/wintergrasp/runtime-types";

export function wintergraspRuntime(
  ctx: Ctx,
  store: WintergraspStore,
  core: CoreStores,
): AreaRuntime<WintergraspActs> {
  return {
    act: {
      ...answerQueueActs(ctx, store),
      ...answerEntryActs(ctx, store),
      ...exitQueueActs(ctx, store),
      ...hearthActs(ctx, store, core),
    },
    dispose: () => undefined,
  };
}
