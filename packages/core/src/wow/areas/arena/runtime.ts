import { arenaChangeActs } from "#wow/areas/arena/runtime-change";
import { arenaInviteActs } from "#wow/areas/arena/runtime-invite";
import { arenaQueryActs } from "#wow/areas/arena/runtime-query";
import { arenaQueueActs } from "#wow/areas/arena/runtime-queue";
import type { Ctx } from "#wow/areas/arena/runtime-shared";
import type { ArenaActs } from "#wow/areas/arena/runtime-types";
import type { ArenaStore } from "#wow/areas/arena/store";
import type { AreaRuntime } from "#wow/areas/contract";
import type { CoreStores } from "#wow/session-stores";

export type { ArenaActs } from "#wow/areas/arena/runtime-types";

export function arenaRuntime(
  ctx: Ctx,
  store: ArenaStore,
  _core: CoreStores,
): AreaRuntime<ArenaActs> {
  return {
    act: {
      ...arenaQueryActs(ctx, store),
      ...arenaInviteActs(ctx, store),
      ...arenaChangeActs(ctx, store),
      ...arenaQueueActs(ctx, store),
    },
    dispose: () => undefined,
  };
}
