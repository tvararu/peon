import type {
  RewardsEvent,
  TacticsEvent,
  Unsubscribe,
  VendorEvent,
  WorldHandle,
} from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { HarnessFlags } from "#harness/contract/config";
import type {
  GameLogEntry,
  LogClass,
  LogDraft,
  LogEvent,
} from "#harness/contract/log";
import type { RunEvent, RunRecord, RunRegistry } from "#harness/contract/runs";
import type {
  AttackLedger,
  DeliverySink,
  EventRouter,
  GameLog,
  JsonlSink,
} from "#harness/contract/services";
import type { WakeGuard } from "#harness/events/guard";
import { createMoveJoin } from "#harness/events/move-join";
import {
  createRuleMemo,
  type Drafts,
  type RuleContext,
  type RuleInput,
  type RuleLookup,
  type RuleMemo,
  runDrafts,
  type Tap,
} from "#harness/events/rules";
import {
  chatDrafts,
  duelDrafts,
  groupDrafts,
} from "#harness/events/rules-chat";
import {
  combatDrafts,
  cycleDrafts,
  tacticsDrafts,
  vitalsDrafts,
} from "#harness/events/rules-combat";
import { deathDrafts } from "#harness/events/rules-death";
import { recoveryDrafts } from "#harness/events/rules-life";
import {
  controlDrafts,
  entityDrafts,
  noticeDrafts,
  packetErrorDrafts,
  trainerDrafts,
  vendorDrafts,
} from "#harness/events/rules-world";
import {
  lootDrafts,
  moneyDrafts,
  questDrafts,
  rewardsDrafts,
} from "#harness/events/rules-world-quest";
import { flushPendingXp, XP_SOURCE_WAIT_MS } from "#harness/events/rules-xp";
import {
  awaitItemNames,
  ITEM_NAME_WAIT_MS,
  itemLabelIn,
} from "#harness/ops/item-names";

export type RouterInit = {
  log: GameLog;
  jevLog: JsonlSink;
  runs: RunRegistry;
  attacks: AttackLedger;
  guard: WakeGuard;
  flags: HarnessFlags;
  context: () => RuleContext;
};

type Route = (make: (rc: RuleInput) => Drafts) => void;
type Named = (itemIds: readonly number[], run: () => void) => boolean;
type SubscribeInit = {
  handle: WorldHandle;
  route: Route;
  named: Named;
  selfGuid: () => bigint;
  jev: (event: TacticsEvent) => void;
  logEntities: boolean;
};
type LookupInit = { handle: WorldHandle; attacks: AttackLedger };

const HUMAN_EVENTS = new Set<LogEvent>([
  "packet/error",
  "session/connected",
  "session/lost",
  "session/wake_throttled",
]);
const JEV_EVENTS = new Set<TacticsEvent["type"]>([
  "request",
  "result",
  "applied",
]);

const NO_LOOKUP: RuleLookup = {
  experience: () => ({ next: undefined, xp: undefined }),
  itemName: () => undefined,
  lastAttacker: () => undefined,
  place: () => ({ area: undefined, zone: undefined }),
  questTitle: () => undefined,
  selfVitals: () => undefined,
  tapOf: () => undefined,
  unitLevel: () => undefined,
  unitName: () => undefined,
};

function tapIn(handle: WorldHandle, guid: bigint): Tap | undefined {
  const row = handle
    .queryNearby({ all: true })
    .find((candidate) => candidate.entity.guid === guid);
  if (!row) return;
  if (row.tappedByOther) return "other";
  return row.tapped ? "mine" : "none";
}

function questTitleIn(
  handle: WorldHandle,
  questId: number,
): string | undefined {
  const query = handle
    .getQuestState()
    .queries.find((candidate) => candidate.questId === questId);
  return query?.status === "known" ? query.data.title : undefined;
}

function placeOf(handle: WorldHandle): {
  zone: string | undefined;
  area: string | undefined;
} {
  try {
    const { area, zone } = handle.getPlaceState();
    return { area, zone };
  } catch {
    return { area: undefined, zone: undefined };
  }
}

export function lookupFor(init: LookupInit | undefined): RuleLookup {
  if (!init) return NO_LOOKUP;
  const { handle, attacks } = init;
  const labelOf = itemLabelIn(handle);
  const unit = (guid: bigint) =>
    handle.getNearbyEntities().find((entity) => entity.guid === guid);
  return {
    experience() {
      const { nextLevelXp, xp } = handle.getExperienceState();
      return { next: nextLevelXp, xp };
    },
    itemName: (itemId) => labelOf(itemId)?.name,
    lastAttacker: () => attacks.lastAttacker(),
    place: () => placeOf(handle),
    questTitle: (questId) => questTitleIn(handle, questId),
    selfVitals() {
      const { health, maxHealth, maxPower, power } =
        handle.getCombatState().self;
      if (health === undefined || maxHealth === undefined) return;
      return {
        hp: health,
        maxHp: maxHealth,
        maxPower: maxPower ?? 0,
        power: power ?? 0,
      };
    },
    tapOf: (guid) => tapIn(handle, guid),
    unitLevel(guid) {
      const entity = unit(guid);
      return entity && "level" in entity ? entity.level : undefined;
    },
    unitName: (guid) => unit(guid)?.name,
  };
}

function routeRewards(init: SubscribeInit, event: RewardsEvent): void {
  const { named, route } = init;
  const pushed = event.state.lastItemPush;
  const own = event.type === "item_push" && pushed?.guid === init.selfGuid();
  const later = () => route((rc) => lootDrafts(event, rc));
  if (!own || named([pushed.itemId], later))
    route((rc) => rewardsDrafts(event, rc));
  else route((rc) => moneyDrafts(event, rc));
}

function routeVendor(init: SubscribeInit, event: VendorEvent): void {
  const now = () => init.route((rc) => vendorDrafts(event, rc));
  const ids = (event.state.window?.items ?? []).map((good) => good.itemId);
  if (event.type !== "listed" || init.named(ids, now)) now();
}

function subscribeAll(init: SubscribeInit): Unsubscribe[] {
  const { handle, route, jev, logEntities } = init;
  return [
    handle.onMessage((msg) => route((rc) => chatDrafts(msg, rc))),
    handle.onGroupEvent((event) => route((rc) => groupDrafts(event, rc))),
    handle.onDuelEvent((event) => route((rc) => duelDrafts(event, rc))),
    handle.onCombatEvent((event) => route((rc) => combatDrafts(event, rc))),
    handle.onTacticsEvent((event) => {
      if (JEV_EVENTS.has(event.type)) jev(event);
      else route((rc) => tacticsDrafts(event, rc));
    }),
    handle.onCycleEvent((event) => route((rc) => cycleDrafts(event, rc))),
    handle.onRecoveryEvent((event) => route((rc) => recoveryDrafts(event, rc))),
    handle.onEntityEvent((event) =>
      route((rc) => [
        ...entityDrafts(event, { ...rc, logEntities }),
        ...vitalsDrafts(event, rc),
        ...deathDrafts(event, rc),
      ]),
    ),
    handle.onControlEvent((event) => route((rc) => controlDrafts(event, rc))),
    handle.onQuestEvent((event) => route((rc) => questDrafts(event, rc))),
    handle.onRewardsEvent((event) => routeRewards(init, event)),
    handle.onVendorEvent((event) => routeVendor(init, event)),
    handle.onTrainerEvent((event) => route((rc) => trainerDrafts(event, rc))),
    handle.onPacketError((opcode, error) =>
      route((rc) => packetErrorDrafts(opcode, error, rc)),
    ),
    handle.onNotice((event) => route((rc) => noticeDrafts(event, rc))),
    handle.onGuildEvent(ignoreFailure),
    handle.onFriendEvent(ignoreFailure),
    handle.onIgnoreEvent(ignoreFailure),
    handle.onRemoteMotionEvent(ignoreFailure),
    handle.onDestroyEvent(ignoreFailure),
    handle.onDefenseEvent(ignoreFailure),
  ];
}

function deliver(sink: DeliverySink, entry: GameLogEntry): void {
  if (HUMAN_EVENTS.has(entry.event)) sink.human(entry);
  if (entry.class === "wake") sink.wake([entry]);
  if (entry.class === "passive") sink.passive(entry);
}

function summarised(draft: LogDraft, run: RunRecord): boolean {
  switch (draft.event) {
    case "fight/start":
    case "fight/end":
    case "combat/kill_credit":
      return true;
    case "xp/gain":
      return draft.data["source"] === "kill";
    case "loot/item":
      return draft.data["source"] === "loot";
    case "money/change":
      return draft.data["reason"] === "loot";
    case "quest/progress":
    case "quest/completed":
      return run.args["quest"] !== undefined;
    default:
      return false;
  }
}

function consumer(
  draft: LogDraft,
  run: RunRecord | undefined,
): string | undefined {
  if (draft.class !== "passive" || run?.kind !== "engage") return;
  return summarised(draft, run) ? (run.toolCallId ?? run.id) : undefined;
}

function stamped(draft: LogDraft, run: RunRecord | undefined): LogDraft {
  const delivered = draft.class === "log" ? undefined : false;
  const consumedBy = consumer(draft, run);
  return { ...draft, consumedBy, delivered, runId: draft.runId ?? run?.id };
}

const TALLIED = new Set<RunRecord["status"]>(["succeeded", "partly"]);
export const RUN_TAIL_MS = 2000;

function reportedEnd(entry: GameLogEntry, record: RunRecord): boolean {
  if (entry.domain === "life") return true;
  return record.kind === "recover" && entry.event === "control/teleport";
}

function createHeldRows(log: GameLog) {
  const held = new Map<string, number[]>();
  const seen = new Map<string, GameLogEntry[]>();
  const cover = (record: RunRecord) => {
    const rows = seen.get(record.id) ?? [];
    seen.delete(record.id);
    if (!record.awaited || record.status === "cancelled") return;
    const by = record.toolCallId ?? record.id;
    for (const row of rows)
      if (reportedEnd(row, record)) log.mark(row.seq, { consumedBy: by });
  };
  return {
    hold(entry: GameLogEntry) {
      if (entry.runId === undefined) return;
      if (entry.consumedBy === undefined) {
        const rows = seen.get(entry.runId) ?? [];
        if (entry.domain === "life" || entry.event === "control/teleport")
          seen.set(entry.runId, [...rows, entry]);
        return;
      }
      held.set(entry.runId, [...(held.get(entry.runId) ?? []), entry.seq]);
    },
    settle({ type, record }: RunEvent) {
      if (type !== "ended") return;
      cover(record);
      const seqs = held.get(record.id) ?? [];
      held.delete(record.id);
      if (TALLIED.has(record.status)) return;
      for (const seq of seqs) log.mark(seq, { consumedBy: undefined });
    },
  };
}

function throttled(draft: LogDraft, cls: LogClass): LogDraft {
  const text = `Wake held back: ${draft.event} became ${cls}.`;
  return {
    class: "log",
    data: { event: draft.event, to: cls },
    domain: "session",
    event: "session/wake_throttled",
    text,
  };
}

function armXp(memo: RuleMemo, route: Route): void {
  const pending = memo.pendingXp;
  if (!pending || pending.armed) return;
  pending.armed = true;
  const flush = () => {
    if (memo.pendingXp === pending) route(flushPendingXp);
  };
  setTimeout(flush, XP_SOURCE_WAIT_MS);
}

type WriterInit = Pick<RouterInit, "guard" | "log" | "runs">;

function createWriter({ guard, log, runs }: WriterInit) {
  const held = createHeldRows(log);
  const moves = createMoveJoin();
  let ended: { record: RunRecord; at: number } | undefined;
  const runOf = (draft: LogDraft, now: number) => {
    if (draft.runId) return runs.get(draft.runId);
    const active = runs.active();
    if (active || !ended || now - ended.at > RUN_TAIL_MS) return active;
    const { record } = ended;
    const tail = TALLIED.has(record.status) && consumer(draft, record);
    return tail ? record : undefined;
  };
  const admit = (draft: LogDraft, rc: RuleContext): LogClass => {
    const wanted = draft.class === "wake" && !rc.wake ? "passive" : draft.class;
    return wanted === "log" ? "log" : guard.admit({ ...draft, class: wanted });
  };
  const write = (draft: LogDraft, rc: RuleContext) => {
    const cls = admit(draft, rc);
    const run = runOf({ ...draft, class: cls }, rc.now);
    held.hold(log.append(stamped({ ...draft, class: cls }, run)));
    if (draft.class === "wake" && rc.wake && cls !== "wake")
      log.append(throttled(draft, cls));
  };
  return {
    observe: (entry: GameLogEntry) => moves.observe(entry),
    record(draft: LogDraft, rc: RuleContext) {
      const runId = runs.active()?.id;
      if (!moves.take(draft, runId, (late) => write(late, rc)))
        write(draft, rc);
    },
    settle(event: RunEvent, now: number) {
      if (event.type === "ended") {
        moves.flush();
        ended = { at: now, record: event.record };
      }
      held.settle(event);
    },
  };
}

function namedFor(
  itemName: RuleLookup["itemName"],
  signal: AbortSignal,
): Named {
  return (itemIds, run) => {
    if (itemIds.every((itemId) => itemName(itemId))) return true;
    awaitItemNames(itemIds, itemName, { signal, timeoutMs: ITEM_NAME_WAIT_MS })
      .then(() => {
        if (!signal.aborted) run();
      })
      .catch(ignoreFailure);
    return false;
  };
}

export function createEventRouter(init: RouterInit): EventRouter {
  const { log, runs } = init;
  let sink: DeliverySink | undefined;
  let lookup = lookupFor(undefined);
  let memo = createRuleMemo();
  const writer = createWriter(init);
  const route: Route = (make) => {
    const rc: RuleInput = { ...init.context(), lookup, memo };
    for (const draft of make(rc)) writer.record(draft, rc);
    armXp(rc.memo, route);
  };
  const jev = (event: TacticsEvent) =>
    init.jevLog.write({ ...event, ts: init.context().now });
  log.subscribe((entry) => {
    writer.observe(entry);
    if (sink) deliver(sink, entry);
  });
  runs.subscribe((event) => {
    writer.settle(event, init.context().now);
    route((rc) => runDrafts(event, rc));
  });
  return {
    attach(handle) {
      lookup = lookupFor({ attacks: init.attacks, handle });
      memo = createRuleMemo();
      const life = new AbortController();
      const offs = subscribeAll({
        handle,
        jev,
        logEntities: init.flags.logEntities,
        named: namedFor(lookup.itemName, life.signal),
        route,
        selfGuid: () => init.context().selfGuid,
      });
      return () => {
        life.abort();
        for (const off of offs) off();
      };
    },
    setSink(next) {
      sink = next;
    },
  };
}
