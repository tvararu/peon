import type { CycleTargetRecord, TacticsOutcome } from "@tuicraft/core";
import { setSelf, setUnits, unitRow } from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

export const STALKER = 0x20n;
export const STALKER_2 = 0x22n;
export const LYNX = 0x21n;
export const KILL: TacticsOutcome = {
  reason: "server_kill_credit",
  status: "completed",
};

export function stalker(guid: bigint, distance: number) {
  return unitRow({
    distance,
    entry: 15_366,
    guid,
    level: 7,
    name: "Springpaw Stalker",
    x: distance,
    y: 0,
  });
}

export function xp(handle: MockHandle, victim: bigint, total: number): void {
  const state = handle.getCombatState();
  handle.triggerCombatEvent({
    state: { ...state, lastXp: { at: 0, kind: "kill", total, victim } },
    type: "xp",
  });
}

export function tactics(
  handle: MockHandle,
  finish: ((runId: string) => void) | undefined,
): void {
  const idle = handle.getTacticsState();
  handle.startTactics = (guid, instruction, signal) => {
    const runId = "t1";
    handle.getTacticsState = () => ({
      ...idle,
      runId,
      status: "active",
      targetGuid: guid,
    });
    handle.triggerTacticsEvent({
      framing: "minimal",
      instruction,
      runId,
      targetGuid: `0x${guid.toString(16)}`,
      type: "started",
    });
    return new Promise<void>((resolve) => {
      signal?.addEventListener("abort", () => resolve(), { once: true });
      if (finish)
        queueMicrotask(() => {
          finish(runId);
          resolve();
        });
    });
  };
}

export function outcome(
  handle: MockHandle,
  runId: string,
  result: TacticsOutcome,
): void {
  handle.triggerTacticsEvent({ ...result, runId, type: "outcome" });
}

export function namedLater(
  handle: MockHandle,
  itemId: number,
  name: string,
  ms: number,
): void {
  const inventory = handle.getInventoryState();
  let named = false;
  setTimeout(() => {
    named = true;
  }, ms);
  const item = {
    contained: undefined,
    count: 1,
    durability: undefined,
    entry: itemId,
    flags: 0,
    guid: 0x90n,
    maxDurability: undefined,
    owner: undefined,
    randomPropertyId: 0,
  };
  handle.getInventoryState = () => ({
    ...inventory,
    slots: [
      {
        bag: 255,
        guid: 0x90n,
        item: { ...item, name: named ? name : null, quality: named ? 0 : null },
        region: "backpack",
        slot: 23,
        status: "occupied",
      },
    ],
  });
}

export function pushItem(handle: MockHandle, itemId: number): void {
  const state = handle.getRewardsState();
  handle.triggerRewardsEvent({
    at: 0,
    state: {
      ...state,
      lastItemPush: {
        bagSlot: 255,
        count: 1,
        created: 0,
        guid: 0n,
        itemId,
        observedAt: 0,
        randomPropertyId: 0,
        randomSuffix: 0,
        received: 1,
        showInChat: 1,
        slot: 0,
        totalCount: 1,
      },
    },
    type: "item_push",
  });
}

export function lootsFang(
  handle: MockHandle,
  name: string | null = "Broken Fang",
): void {
  const base = handle.getRewardsState();
  const open = {
    ...base,
    loot: {
      guid: STALKER,
      invalidatedReason: undefined,
      items: [
        {
          count: 1,
          displayId: 0,
          itemId: 7073,
          name,
          quality: 0,
          randomPropertyId: 0,
          randomSuffix: 0,
          slot: 0,
          slotType: 0,
        },
      ],
      lootType: 1,
      money: 12,
      openedAt: 0,
      phase: "open" as const,
    },
  };
  const pushed = {
    bagSlot: 255,
    count: 1,
    created: 0,
    guid: 0n,
    itemId: 7073,
    observedAt: 0,
    randomPropertyId: 0,
    randomSuffix: 0,
    received: 1,
    showInChat: 1,
    slot: 0,
    totalCount: 1,
  };
  handle.lootCorpse = async () => {
    handle.getRewardsState = () => open;
    handle.triggerRewardsEvent({ at: 0, state: open, type: "loot_opened" });
    handle.triggerRewardsEvent({
      at: 0,
      state: { ...open, lastItemPush: pushed },
      type: "item_push",
    });
    handle.triggerRewardsEvent({
      at: 0,
      state: {
        ...open,
        lastMoneyNotice: { alone: true, money: 12, observedAt: 0 },
      },
      type: "money_notice",
    });
    handle.getRewardsState = () => base;
    return { ok: true, record: undefined };
  };
}

export function cycleEnds(
  handle: MockHandle,
  records: CycleTargetRecord[],
  stopCause: string,
): void {
  const base = handle.getCycleState();
  const stopped = {
    ...base,
    active: false,
    phase: "stopped" as const,
    queue: records,
    stopCause,
  };
  const finish = () => {
    handle.getCycleState = () => stopped;
    handle.triggerCycleEvent({ at: 0, state: stopped, type: "stopped" });
  };
  const start = async () => {
    handle.getCycleState = () => ({ ...base, active: true, phase: "fighting" });
    queueMicrotask(finish);
  };
  handle.startCycle = start;
  handle.startQuestCycle = start;
}

export async function field() {
  const t = await createTestRuntime();
  t.handle.capabilities = () => ({
    factions: true,
    jev: true,
    navigation: true,
    spells: true,
  });
  setSelf(t.handle, { level: 10 });
  setUnits(t.handle, [stalker(STALKER, 22), stalker(STALKER_2, 28)]);
  return t;
}
