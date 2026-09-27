import { jest } from "bun:test";
import type { WalkOutcome } from "@peon/core";
import { Emitter } from "@peon/core/lib/emitter";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import {
  type CycleEvent,
  EncounterCycleRuntime,
} from "#harness/loops/encounter-cycle";
import type { Game } from "#harness/loops/game";
import { recoveryPort, rewardsPort } from "#harness/loops/ports";
import type { TacticsEvent, TacticsState } from "#harness/loops/tactics";
import { observeNavigation } from "#harness/navigation/observation";
import type { NavigationState } from "#harness/navigation/route-follower";

export type MockGame = Omit<MockHandle, "capabilities"> &
  Game & {
    triggerTacticsEvent: (event: TacticsEvent) => void;
    triggerCycleEvent: (event: CycleEvent) => void;
  };

export function createMockGame(): MockGame {
  const handle = createMockHandle();
  const tacticsState: TacticsState = {
    instruction: "",
    lastDecision: undefined,
    lastDiscardReason: undefined,
    lastOutcome: undefined,
    lastRequest: undefined,
    lastResult: undefined,
    runId: undefined,
    status: "idle",
    targetGuid: undefined,
    timeouts: { consecutive: 0, limit: 3, total: 0 },
  };
  const cycle = new EncounterCycleRuntime({
    bags: { questItems: () => new Set(), stackSize: async () => undefined },
    control: {
      face: () => {},
      move: () => {},
      snapshot: () => handle.getControlState(),
    },
    entity: () => undefined,
    now: () => 0,
    recovery: recoveryPort(handle),
    rewards: rewardsPort(handle),
    tactics: {
      snapshot: () => tacticsState,
      start: (_context, signal) =>
        new Promise<void>((resolve) =>
          signal?.addEventListener("abort", () => resolve(), { once: true }),
        ),
      stop: () => {},
    },
  });
  const tactics = new Emitter<[TacticsEvent]>();
  const cycles = new Emitter<[CycleEvent]>();
  cycle.onEvent((event) => cycles.emit(event));
  const game: MockGame = Object.assign(handle, {
    capabilities: jest.fn(() => ({
      factions: false,
      jev: false,
      navigation: false,
      spells: false,
    })),
    getCycleState: jest.fn(() => cycle.snapshot()),
    getNavigationState: jest.fn(
      (): NavigationState => ({
        active: false,
        blockedReason: undefined,
        destination: undefined,
        owner: "none",
        refusal: undefined,
        remaining: undefined,
      }),
    ),
    getTacticsState: jest.fn(() => tacticsState),
    goTo: jest.fn(),
    halt: jest.fn(() => {
      cycle.stop("halt");
    }),
    lootCorpse: jest.fn(async () => ({ ok: true as const, record: undefined })),
    observeNavigation: jest.fn(() =>
      observeNavigation(game.getNavigationState()),
    ),
    onCycleEvent: (cb: (event: CycleEvent) => void) => cycles.subscribe(cb),
    onTacticsEvent: (cb: (event: TacticsEvent) => void) =>
      tactics.subscribe(cb),
    recoverCorpse: jest.fn(async () => ({
      cause: "mock_recover_unavailable",
      ok: false as const,
    })),
    startCycle: jest.fn(
      (guids: bigint[], instruction: string, maxStarts?: number) =>
        cycle.start({ guids, instruction, maxStarts }),
    ),
    startQuestCycle: jest.fn(async () => {}),
    startTactics: jest.fn(async () => {}),
    stopCycle: jest.fn(() => {
      cycle.stop("manual_override");
    }),
    takeControl: jest.fn((reason: string) => {
      cycle.stop(reason);
    }),
    triggerCycleEvent(event: CycleEvent) {
      cycles.emit(event);
    },
    triggerTacticsEvent(event: TacticsEvent) {
      tactics.emit(event);
    },
    walkToward: jest.fn(async (): Promise<WalkOutcome> => {
      throw new Error("mock_walk_unavailable");
    }),
  });
  return game;
}
