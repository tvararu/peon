import { describe, expect, jest, test } from "bun:test";
import type { UnitEntity, WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/travel-bind";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type QuestState = ReturnType<WorldHandle["getQuestState"]>;

const INNKEEPER = 0xf1_30_00_3e_4a_00_12_34n;
const VENDOR = 0xf1_30_00_3e_4b_00_12_35n;
const HOME = { areaId: 3487, mapId: 530, x: 9500, y: -6800, z: 20 };

function row(guid: bigint, distance: number, roles: Row["roles"]): Row {
  const position = { mapId: 530, orientation: 0, x: 1, y: 2, z: 3 };
  const entity: UnitEntity = {
    class_: 1,
    displayId: 1,
    entry: 16_618,
    factionTemplate: 1604,
    gender: 0,
    guid,
    health: 100,
    level: 30,
    maxHealth: 100,
    maxPower: [],
    name: "Innkeeper",
    npcFlags: 0x1_00_00,
    objectType: 3,
    position,
    power: [],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
  return {
    attackable: false,
    attackingMe: false,
    bearingRadians: null,
    distance,
    entity,
    horizontalDistance: distance,
    lootable: false,
    originSource: null,
    originUpdatedAt: null,
    position,
    positionKind: null,
    positionObservedAt: null,
    positionSource: null,
    preparedAt: 0,
    relation: "friendly",
    remotePose: undefined,
    roles,
    self: false,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
  };
}

function context(
  args: Record<string, string>,
  rows: Row[],
): FlowContext & { handle: MockHandle } {
  const handle = createMockHandle();
  handle.queryNearby = () => rows;
  return { args, handle, settle: settleWithin(200) };
}

function gossip(handle: MockHandle, texts: string[]): void {
  const options = texts.map((text, optionIndex) => ({
    boxText: "",
    coded: 0,
    icon: 5,
    money: 0,
    optionIndex,
    text,
  }));
  const dialog = {
    data: { guid: INNKEEPER, menuId: 7, options, quests: [], titleTextId: 1 },
    kind: "gossip",
  };
  handle.getQuestState = jest.fn(
    () => ({ dialog, giver: INNKEEPER }) as unknown as QuestState,
  );
}

describe("travel-bind flow", () => {
  test("binds at the nearest innkeeper and waits for bound", async () => {
    const ctx = context({}, [
      row(VENDOR, 2, ["vendor"]),
      row(INNKEEPER, 3, ["innkeeper", "vendor"]),
    ]);
    const bind = jest
      .spyOn(ctx.handle.travel.act, "bindActivate")
      .mockImplementation(async () => {
        setTimeout(
          () =>
            ctx.handle.triggerAreaEvent("travel", {
              areaId: HOME.areaId,
              binder: INNKEEPER,
              type: "bound",
            }),
          10,
        );
        return { home: HOME, status: "ok" };
      });
    const result = await flow.run(ctx);
    expect(bind).toHaveBeenCalledWith(INNKEEPER);
    expect(result).toMatchObject({
      bound: { areaId: HOME.areaId, binder: "0xf130003e4a001234" },
      outcome: { home: HOME, status: "ok" },
    });
  });

  test("reports a bind the server did not answer", async () => {
    const ctx = context({}, [row(INNKEEPER, 3, ["innkeeper"])]);
    jest
      .spyOn(ctx.handle.travel.act, "bindActivate")
      .mockResolvedValue({ status: "no_answer" });
    expect(await flow.run(ctx)).toMatchObject({
      bound: null,
      outcome: { status: "no_answer" },
    });
  });

  test("refuses when no innkeeper is in view", async () => {
    const ctx = context({}, [row(VENDOR, 2, ["vendor"])]);
    await expect(Promise.resolve(flow.run(ctx))).rejects.toThrow(
      "no innkeeper",
    );
  });

  test("with gossip=1 picks the home option and waits for the offer", async () => {
    const ctx = context({ gossip: "1" }, [row(INNKEEPER, 3, ["innkeeper"])]);
    gossip(ctx.handle, [
      "Let me browse your goods.",
      "Make this inn your home.",
    ]);
    const bind = jest.spyOn(ctx.handle.travel.act, "bindActivate");
    ctx.handle.selectGossipOption = jest.fn(() => {
      ctx.handle.triggerAreaEvent("travel", {
        npc: INNKEEPER,
        type: "bind_offer",
      });
    });
    const result = await flow.run(ctx);
    expect(ctx.handle.talk).toHaveBeenCalledWith(INNKEEPER);
    expect(ctx.handle.selectGossipOption).toHaveBeenCalledWith(1);
    expect(bind).not.toHaveBeenCalled();
    expect(result).toMatchObject({ offer: { npc: "0xf130003e4a001234" } });
  });

  test("with gossip=1 refuses a menu with no home option", async () => {
    const ctx = context({ gossip: "1" }, [row(INNKEEPER, 3, ["innkeeper"])]);
    gossip(ctx.handle, ["Let me browse your goods."]);
    await expect(Promise.resolve(flow.run(ctx))).rejects.toThrow(
      "no home option",
    );
  });
});
