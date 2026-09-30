import { jest } from "bun:test";
import type { TSchema } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { CombatState, NearbyRow, NpcRole, WorldHandle } from "@peon/core";
import type { LookAfter, ToolDetailsFor } from "#harness/contract/details";
import type {
  HarnessRuntime,
  WorldSnapshots,
} from "#harness/contract/services";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createAttackLedger } from "#harness/ops/danger";
import { createRefTable } from "#harness/ops/refs";
import { createSightings } from "#harness/ops/sightings";
import { createRunRegistry } from "#harness/runs/registry";
import { lookTool } from "#harness/tools/look";
import {
  createTestRuntime,
  type TestRuntime,
} from "#test-support/runtime-fixture";
import {
  nearbyRow,
  selfPose,
  selfRow,
  setWorld,
  type UnitInit,
  unitEntity,
} from "#test-support/world-fixtures";

export const NOW = 1_000_000;

export type LookWorld = TestRuntime & {
  snapshots: WorldSnapshots;
  tool: ToolDefinition<TSchema, ToolDetailsFor<"look", LookAfter>>;
};

export async function world(): Promise<LookWorld> {
  const clock = { now: () => NOW };
  const snapshots: WorldSnapshots = {
    attach: () => () => {},
    capture: jest.fn(),
    write: jest.fn(() => Promise.resolve("")),
  };
  const log = createGameLog({
    char: () => "Fgklibhlflc",
    clock,
    file: undefined,
  });
  const runs = createRunRegistry({
    clock,
    log,
    sink: createJsonlSink({ file: undefined }),
  });
  const parts = {
    attacks: createAttackLedger(clock),
    clock,
    log,
    refs: createRefTable(),
    runs,
    sightings: createSightings(clock),
    snapshots,
  };
  const t = await createTestRuntime({ parts });
  const typed = t as unknown as {
    clock: LookWorld["clock"];
    handle: LookWorld["handle"];
    rt: HarnessRuntime;
  };
  return { ...typed, snapshots, tool: lookTool.definition(typed.rt) };
}

export function questLog(
  { handle, rt }: LookWorld,
  questId: number,
  ender: string,
) {
  rt.quests.set(questId, {
    ender,
    giver: "Deputy Willem",
    objectives: `Speak with ${ender}.`,
    title: "A Threat Within",
  });
  const state = handle.getQuestState();
  const counters: [number, number, number, number] = [0, 0, 0, 0];
  handle.getQuestState = () => ({
    ...state,
    log: {
      complete: true,
      slots: [{ counters, expiresAtSeconds: 0, flags: 0, questId, slot: 0 }],
    },
  });
}

export function crowd(last: UnitInit): NearbyRow[] {
  const rabbits = [5, 10, 15, 20, 25].map((dx, i) =>
    nearbyRow(unitEntity({ dx, guid: BigInt(0x60 + i), name: "Rabbit" }), {
      relation: "neutral",
    }),
  );
  return [
    selfRow(),
    ...rabbits,
    nearbyRow(unitEntity({ dx: 30, guid: 0x70n, level: 5, name: "Stallion" }), {
      relation: "neutral",
    }),
    friendly({ dx: 40, guid: 0x71n, level: 22, name: "Stormwind Guard" }),
    friendly({ dx: 45, guid: 0x72n, level: 10, name: "Fgkliba", player: true }),
    friendly(last),
  ];
}

export const friendly = (init: UnitInit, roles: NpcRole[] = []) =>
  nearbyRow(unitEntity(init), { relation: "friendly", roles });
export const stalker = () =>
  nearbyRow(
    unitEntity({ dx: 78, guid: 0x25n, level: 7, name: "Springpaw Stalker" }),
    { relation: "hostile" },
  );

export function eversong(extra: NearbyRow[] = []): NearbyRow[] {
  return [
    selfRow(),
    friendly({ guid: 0x21n, level: 10, name: "Fgklibiancf", player: true }),
    friendly({ dy: -11, guid: 0x22n, level: 30, name: "Velan Brightoak" }, [
      "questgiver",
    ]),
    friendly({ dy: 38, guid: 0x23n, level: 15, name: "Marniel Amberlight" }, [
      "vendor",
      "repair",
    ]),
    friendly({ dx: -58, guid: 0x24n, level: 22, name: "Silvermoon Guardian" }),
    ...extra,
  ];
}

export function place(
  handle: WorldHandle,
  rows: NearbyRow[],
  combat: Partial<CombatState> = {},
) {
  setWorld(handle, {
    combat,
    place: {
      area: "Fairbreeze Village",
      areaId: 3665,
      at: NOW - 240_000,
      zone: "Eversong Woods",
      zoneId: 3430,
    },
    pose: selfPose(NOW),
    rows,
    serverPose: selfPose(NOW - 12_000, { source: "server" }),
  });
}
