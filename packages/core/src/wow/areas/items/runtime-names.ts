import { bounded } from "#lib/abort";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import type { ItemsEvent } from "#wow/areas/items/events";
import { buildItemNameQuery } from "#wow/areas/items/protocol-names";
import type { SetItemName } from "#wow/areas/items/reads";
import type { ItemsStore } from "#wow/areas/items/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const NAME_ANSWER_MS = 5000;

export type NameActs = {
  querySetItemName: (entry: number) => Promise<SetItemName | undefined>;
};

type Env = { ctx: AreaRuntimeCtx<ItemsEvent>; store: ItemsStore };

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

async function querySetItemName(
  { ctx, store }: Env,
  entry: number,
): Promise<SetItemName | undefined> {
  if (!Number.isInteger(entry) || entry <= 0)
    throw new Error(`item entry ${entry} is not a positive integer`);
  const { promise, first } = store.awaitSetItemName(entry);
  if (first)
    ctx.send(GameOpcode.CMSG_ITEM_NAME_QUERY, buildItemNameQuery(entry));
  try {
    return await bounded(promise, ctx.signal, NAME_ANSWER_MS, "timeout");
  } catch (error) {
    if (!isTimeout(error)) {
      store.dropSetItemName(entry);
      throw error;
    }
    store.expireSetItemName(entry);
    return undefined;
  }
}

export function nameActs(env: Env): NameActs {
  return { querySetItemName: (entry) => querySetItemName(env, entry) };
}
