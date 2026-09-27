import type { TacticsEvent, Unsubscribe, WorldHandle } from "@tuicraft/core";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { HarnessFlags } from "#harness/contract/config";
import type {
  GameLogEntry,
  LogClass,
  LogDraft,
  LogEvent,
} from "#harness/contract/log";
import type { RunRegistry } from "#harness/contract/runs";
import type {
  AttackLedger,
  DeliverySink,
  EventRouter,
  GameLog,
  JsonlSink,
} from "#harness/contract/services";
import type { WakeGuard } from "#harness/events/guard";
import {
  createRuleMemo,
  type Drafts,
  type RuleContext,
  type RuleInput,
  type RuleLookup,
  runDrafts,
} from "#harness/events/rules";
import {
  chatDrafts,
  duelDrafts,
  groupDrafts,
} from "#harness/events/rules-chat";
import {
  combatDrafts,
  cycleDrafts,
  recoveryDrafts,
  tacticsDrafts,
  vitalsDrafts,
} from "#harness/events/rules-combat";
import {
  controlDrafts,
  entityDrafts,
  noticeDrafts,
  packetErrorDrafts,
  trainerDrafts,
  vendorDrafts,
} from "#harness/events/rules-world";
import { questDrafts, rewardsDrafts } from "#harness/events/rules-world-quest";

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
type SubscribeInit = {
  handle: WorldHandle;
  route: Route;
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
  unitLevel: () => undefined,
  unitName: () => undefined,
};

function itemNameIn(handle: WorldHandle, itemId: number): string | undefined {
  for (const slot of handle.getInventoryState().slots)
    if (
      slot.status === "occupied" &&
      slot.item.entry === itemId &&
      slot.item.name
    )
      return slot.item.name;
  const { loot } = handle.getRewardsState();
  if (loot.phase !== "open" && loot.phase !== "closing") return;
  return loot.items.find((item) => item.itemId === itemId)?.name ?? undefined;
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
  const unit = (guid: bigint) =>
    handle.getNearbyEntities().find((entity) => entity.guid === guid);
  return {
    experience() {
      const { nextLevelXp, xp } = handle.getExperienceState();
      return { next: nextLevelXp, xp };
    },
    itemName: (itemId) => itemNameIn(handle, itemId),
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
    unitLevel(guid) {
      const entity = unit(guid);
      return entity && "level" in entity ? entity.level : undefined;
    },
    unitName: (guid) => unit(guid)?.name,
  };
}

function subscribeAll({
  handle,
  route,
  jev,
  logEntities,
}: SubscribeInit): Unsubscribe[] {
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
      ]),
    ),
    handle.onControlEvent((event) => route((rc) => controlDrafts(event, rc))),
    handle.onQuestEvent((event) => route((rc) => questDrafts(event, rc))),
    handle.onRewardsEvent((event) => route((rc) => rewardsDrafts(event, rc))),
    handle.onVendorEvent((event) => route((rc) => vendorDrafts(event, rc))),
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

export function createEventRouter(init: RouterInit): EventRouter {
  const { guard, log, runs } = init;
  let sink: DeliverySink | undefined;
  let lookup = lookupFor(undefined);
  let memo = createRuleMemo();
  const admit = (draft: LogDraft, rc: RuleContext): LogClass => {
    const wanted = draft.class === "wake" && !rc.wake ? "passive" : draft.class;
    return wanted === "log" ? "log" : guard.admit({ ...draft, class: wanted });
  };
  const record = (draft: LogDraft, rc: RuleContext) => {
    const cls = admit(draft, rc);
    const runId = draft.runId ?? runs.active()?.id;
    const delivered = cls === "log" ? undefined : false;
    log.append({ ...draft, class: cls, delivered, runId });
    if (draft.class === "wake" && rc.wake && cls !== "wake")
      log.append(throttled(draft, cls));
  };
  const route: Route = (make) => {
    const rc: RuleInput = { ...init.context(), lookup, memo };
    for (const draft of make(rc)) record(draft, rc);
  };
  const jev = (event: TacticsEvent) =>
    init.jevLog.write({ ...event, ts: init.context().now });
  log.subscribe((entry) => {
    if (sink) deliver(sink, entry);
  });
  runs.subscribe((event) => route((rc) => runDrafts(event, rc)));
  return {
    attach(handle) {
      lookup = lookupFor({ attacks: init.attacks, handle });
      memo = createRuleMemo();
      const offs = subscribeAll({
        handle,
        jev,
        logEntities: init.flags.logEntities,
        route,
      });
      return () => {
        for (const off of offs) off();
      };
    },
    setSink(next) {
      sink = next;
    },
  };
}
