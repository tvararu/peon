import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  loadLocks,
  type ObjectsActs,
  type OpenLockQuery,
  type OpenOutcome,
  openObject,
  queryOpenLock,
  type UseItemOnOutcome,
  useItemOnObject,
} from "#wow/areas/objects/open-acts";
import {
  buildAreaTrigger,
  buildGameObjReportUse,
  buildGameObjUse,
  buildPageTextQuery,
} from "#wow/areas/objects/protocol";
import type {
  ObjectsEvent,
  ObjectsStore,
  PageChain,
  UnansweredPage,
} from "#wow/areas/objects/store";
import { loadAreaTriggers } from "#wow/areas/objects/trigger-catalog";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { SelfEvent } from "#wow/self-store";
import type { CoreStores } from "#wow/session-stores";

export const PAGE_READ_TIMEOUT_MS = 5000;
export const PAGE_READ_MAX_PAGES = 30;

const ARRIVALS = new Set(["teleport", "near_teleport", "new_world"]);

function loadTriggers(
  ctx: AreaRuntimeCtx<ObjectsEvent>,
  store: ObjectsStore,
): void {
  const { dbc, signal } = ctx;
  if (!dbc) return;
  store.loadingTriggers();
  loadAreaTriggers(dbc)
    .then(
      (catalog) => {
        if (!signal.aborted) store.useTriggers(catalog);
      },
      () => store.triggersFailed(),
    )
    .catch(ignoreFailure);
}

export function objectsRuntime(
  ctx: AreaRuntimeCtx<ObjectsEvent>,
  store: ObjectsStore,
  core: CoreStores,
): AreaRuntime<ObjectsActs> {
  function enterTrigger(triggerId: number): void {
    ctx.send(GameOpcode.CMSG_AREATRIGGER, buildAreaTrigger(triggerId));
    store.noteSent(triggerId, core.self.mapId);
  }
  function use(guid: bigint) {
    const record = store.sendUse(guid);
    if ("ok" in record) return record;
    ctx.send(GameOpcode.CMSG_GAMEOBJ_USE, buildGameObjUse(guid));
    ctx.send(GameOpcode.CMSG_GAMEOBJ_REPORT_USE, buildGameObjReportUse(guid));
    return { ok: true as const, record };
  }
  function open(guid: bigint, spellId: number): OpenOutcome {
    return openObject({ ctx, store, core }, guid, spellId);
  }
  function useItemOn(entry: number, target: bigint): Promise<UseItemOnOutcome> {
    return useItemOnObject({ ctx, store, core }, entry, target);
  }
  function openLockSpell(entry: number): Promise<OpenLockQuery> {
    return queryOpenLock({ ctx, store, core }, entry);
  }
  function readPage(firstPageId: number): Promise<PageChain | UnansweredPage> {
    return readChain(ctx, store, firstPageId);
  }
  function arrival(event: SelfEvent): void {
    arriveAt(store, core, event);
  }
  loadTriggers(ctx, store);
  loadLocks(ctx, store);
  const offControl = ctx.listen("control", ({ type, state, reason }) => {
    if (!state.pose) return;
    if (type === "pose_sent")
      for (const id of store.move(state.pose)) enterTrigger(id);
    else if (type === "server_correction" && ARRIVALS.has(reason ?? ""))
      store.arrive(state.pose);
  });
  const offSelf = core.self.onEvent(arrival);
  return {
    act: { enterTrigger, open, openLockSpell, readPage, use, useItemOn },
    dispose: () => {
      offControl();
      offSelf();
    },
  };
}

async function readChain(
  ctx: AreaRuntimeCtx<ObjectsEvent>,
  store: ObjectsStore,
  firstPageId: number,
): Promise<PageChain | UnansweredPage> {
  const pages = store.chain(firstPageId);
  if (pages.length > 0) return { firstPageId, pages: [...pages] };
  const settled = ctx.until(
    (event) =>
      (event.type === "page_read" && event.firstPageId === firstPageId) ||
      (event.type === "page_unanswered" && event.pageId === firstPageId),
    { timeoutMs: PAGE_READ_TIMEOUT_MS },
  );
  ctx.send(
    GameOpcode.CMSG_PAGE_TEXT_QUERY,
    buildPageTextQuery(firstPageId, ctx.selfGuid() ?? 0n),
  );
  try {
    const event = await settled;
    if (event.type === "page_read")
      return { firstPageId: event.firstPageId, pages: [...event.pages] };
    if (event.type === "page_unanswered") return { pageId: firstPageId };
    store.unanswered(firstPageId);
    return { pageId: firstPageId };
  } catch {
    store.unanswered(firstPageId);
    return { pageId: firstPageId };
  }
}

function arriveAt(
  store: ObjectsStore,
  core: CoreStores,
  event: SelfEvent,
): void {
  if (event.type === "login_verified" || event.type === "new_world")
    store.arrive(event.position);
  else if (event.type === "teleport_ack")
    store.arrive({ ...event.ack.info, mapId: core.self.mapId });
}
