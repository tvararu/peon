import { distance2d, type QuestEvent, type WorldHandle } from "@peon/core";
import { messageOf } from "@peon/core/lib/errors";
import { cycleStop } from "#harness/loops/cycle-stop";
import type { CycleVisit, CycleVisitEnd } from "#harness/loops/encounter-cycle";
import { EventWaiter } from "#harness/loops/event-waiter";
import { lootObject } from "#harness/loops/loot-run";
import type { ObjectivePick } from "#harness/loops/quest-objective";

export const OBJECT_REACH_YD = 3;
export const OBJECT_SETTLE_MS = 3000;
export const OBJECT_RELEASE_MS = 5000;

const STEP_YD = 20;
const MAX_STEPS = 8;
const CHEST = 3;
const PER_OBJECT: Record<string, true> = {
  "loot_denied:release_only": true,
  "loot_denied:timeout": true,
};
const PROGRESS: Record<string, true> = {
  completed: true,
  log: true,
  progress: true,
};

type ObjectPick = Extract<ObjectivePick, { kind: "object" }>;

const skipped = (cause: string): CycleVisitEnd => ({ cause, ok: true });

async function reach(
  handle: WorldHandle,
  guid: bigint,
  run: CycleVisit,
): Promise<string | undefined> {
  const { signal } = run;
  if (run.approach) {
    const unreached = await run.approach(guid, signal);
    signal.throwIfAborted();
    if (unreached) return unreached;
  }
  for (let step = 0; step < MAX_STEPS; step++) {
    const pose = handle.getControlState().pose;
    const at = handle.getEntity(guid)?.position;
    if (!pose) return "self_pose_unobserved";
    if (!at) return "target_unobserved";
    const gap = distance2d(pose, at);
    if (gap <= OBJECT_REACH_YD) return undefined;
    const walked = await handle.walkTowardPoint(
      at,
      Math.min(STEP_YD, gap - OBJECT_REACH_YD + 1),
      signal,
    );
    signal.throwIfAborted();
    if (walked.traveled === 0) return "target_unreachable";
  }
  return "target_unreachable";
}

async function releaseStale(run: CycleVisit): Promise<string | undefined> {
  const { phase } = run.rewards.snapshot().loot;
  if (phase === "closed") return undefined;
  if (phase !== "open") return "loot_window_busy";
  run.rewards.close();
  const released = await run.events.find(
    (event) => event.type === "loot_release_observed",
    OBJECT_RELEASE_MS,
    run.signal,
  );
  return released ? undefined : "loot_window_busy";
}

async function openChest(
  handle: WorldHandle,
  pick: ObjectPick,
  run: CycleVisit,
): Promise<CycleVisitEnd> {
  const busy = await releaseStale(run);
  if (busy) return skipped(busy);
  const choice = await handle.objects.act.openLockSpell(pick.entry);
  run.signal.throwIfAborted();
  if (!("by" in choice)) return skipped(choice.reason);
  if (choice.by === "item") return skipped("object_needs_key");
  const used = handle.objects.act.use(pick.guid);
  if (!used.ok) return skipped("object_not_usable");
  const opened = handle.objects.act.open(pick.guid, choice.spellId);
  if (!opened.ok) return skipped(`open_${opened.reason}`);
  const looted = await lootObject(run, pick.guid);
  if (looted.ok) return { ok: true, record: looted.record };
  run.rewards.abandonOpen();
  return PER_OBJECT[looted.cause] ? skipped(looted.cause) : looted;
}

async function useObject(
  handle: WorldHandle,
  pick: ObjectPick,
  run: CycleVisit,
): Promise<CycleVisitEnd> {
  const events = new EventWaiter<QuestEvent>();
  const off = handle.onQuestEvent((event) => events.push(event));
  try {
    const used = handle.objects.act.use(pick.guid);
    if (!used.ok) return skipped("object_not_usable");
    await events.find(
      (event) => PROGRESS[event.type] === true,
      OBJECT_SETTLE_MS,
      run.signal,
    );
    return { ok: true };
  } finally {
    off();
  }
}

export function visitObject(handle: WorldHandle) {
  return async (pick: ObjectPick, run: CycleVisit): Promise<CycleVisitEnd> => {
    try {
      const unreached = await reach(handle, pick.guid, run);
      if (unreached) return skipped(unreached);
      const template = handle.objects.state().templates.get(pick.entry);
      if (!template) return skipped("object_template_unknown");
      return template.type === CHEST
        ? await openChest(handle, pick, run)
        : await useObject(handle, pick, run);
    } catch (error) {
      run.signal.throwIfAborted();
      return cycleStop("object_visit_failed", {
        entry: pick.entry,
        reason: messageOf(error, "object_visit_failed"),
      });
    }
  };
}
