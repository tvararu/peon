import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildSearchJoin,
  buildSearchLeave,
} from "#wow/areas/lfg/protocol-list";
import { isTimeout, reply } from "#wow/areas/lfg/runtime-group";
import type { LfgEvent } from "#wow/areas/lfg/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const DUNGEON_ID_MASK = 0x00_ff_ff_ff;
const MAX_ENTRY = 0xff_ff_ff_ff;

type Ctx = AreaRuntimeCtx<LfgEvent>;

export type LfgSearchResult =
  | { status: "ok"; form: "full" | "difference" }
  | { status: "refused"; reason: string }
  | { status: "no_answer" };
export type LfgStopSearchResult =
  | { status: "ok" }
  | { status: "refused"; reason: string };

export type LfgListActs = {
  searchRaids: (entry: number) => Promise<LfgSearchResult>;
  stopSearch: (entry: number) => Promise<LfgStopSearchResult>;
};

function validEntry(entry: number): boolean {
  return Number.isInteger(entry) && entry >= 1 && entry <= MAX_ENTRY;
}

async function searchRaids(ctx: Ctx, entry: number): Promise<LfgSearchResult> {
  if (!validEntry(entry)) return { status: "refused", reason: "bad_entry" };
  const dungeon = entry & DUNGEON_ID_MASK;
  try {
    const list = await reply(
      ctx,
      (event) => event.type === "raid_list" && event.dungeon === dungeon,
      () => ctx.send(GameOpcode.CMSG_SEARCH_LFG_JOIN, buildSearchJoin(entry)),
    );
    if (list.type !== "raid_list")
      throw new Error("raid list wait matched another event");
    return { status: "ok", form: list.form };
  } catch (error) {
    if (isTimeout(error)) return { status: "no_answer" };
    throw error;
  }
}

function stopSearch(ctx: Ctx, entry: number): Promise<LfgStopSearchResult> {
  if (!validEntry(entry))
    return Promise.resolve({ status: "refused", reason: "bad_entry" });
  try {
    ctx.send(GameOpcode.CMSG_SEARCH_LFG_LEAVE, buildSearchLeave(entry));
  } catch (error) {
    return Promise.reject(error);
  }
  return Promise.resolve({ status: "ok" });
}

export function lfgListActs(
  ctx: Ctx,
  run: <T>(body: () => Promise<T>) => Promise<T>,
): LfgListActs {
  return {
    searchRaids: (entry) => run(() => searchRaids(ctx, entry)),
    stopSearch: (entry) => stopSearch(ctx, entry),
  };
}
