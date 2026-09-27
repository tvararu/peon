import { describe, expect, test } from "bun:test";
import {
  type ControlEvent,
  type ControlPose,
  ObjectType,
  type TrainerEvent,
  type VendorEvent,
  type VendorOutcome,
} from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import {
  controlDrafts,
  entityDrafts,
  noticeDrafts,
  packetErrorDrafts,
  trainerDrafts,
  vendorDrafts,
} from "#harness/events/rules-world";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const handle = createMockHandle();
const controlBase = handle.getControlState();
const vendorBase = handle.getVendorState();

function pose(x: number): ControlPose {
  return {
    mapId: 530,
    orientation: 0,
    source: "server",
    updatedAt: 0,
    x,
    y: 0,
    z: 0,
  };
}

function control(
  type: ControlEvent["type"],
  x?: number,
  reason?: string,
): ControlEvent {
  const at = x === undefined ? undefined : pose(x);
  return { reason, state: { ...controlBase, pose: at, serverPose: at }, type };
}

function vendor(
  type: VendorEvent["type"],
  lastOutcome?: VendorOutcome,
): VendorEvent {
  return { at: 0, state: { ...vendorBase, lastOutcome }, type };
}

const bought: VendorOutcome = {
  action: "buy",
  coinageAfter: 475,
  moneyDelta: -25,
  observedAt: 0,
  reason: undefined,
  request: {
    action: "buy",
    answer: undefined,
    coinageBefore: 500,
    count: 1,
    guid: 0x10n,
    itemId: 159,
    maxPrice: 25,
    minPrice: 25,
    requestedAt: 0,
    slot: 1,
  },
  status: "confirmed",
};

function trainer(type: TrainerEvent["type"], trained: boolean): TrainerEvent {
  const request = {
    action: "train" as const,
    coinageBefore: 1000,
    cost: 100,
    guid: 0x11n,
    learnedBefore: [],
    requestedAt: 0,
    spellId: 591,
    succeeded: trained,
  };
  const lastOutcome = {
    action: "train" as const,
    coinageAfter: 900,
    learnedSpells: [591],
    moneyDelta: -100,
    observedAt: 0,
    reason: undefined,
    request,
    status: "confirmed" as const,
  };
  return {
    at: 0,
    state: {
      coinage: 900,
      lastOutcome,
      level: 10,
      offer: undefined,
      pending: undefined,
    },
    type,
  };
}

describe("controlDrafts", () => {
  test("measures correction drift against the last pose", () => {
    const rc = testRuleInput();
    expect(controlDrafts(control("movement_started", 0), rc)[0]).toMatchObject({
      class: "log",
      event: "control/move_start",
    });
    const [far] = controlDrafts(
      control("server_correction", 8, "observed"),
      rc,
    );
    expect(far).toMatchObject({
      class: "passive",
      data: { driftYd: 8, reason: "observed" },
      event: "control/server_correction",
      text: "The server corrected your position by 8 yd.",
    });
    const [near] = controlDrafts(
      control("server_correction", 10, "observed"),
      rc,
    );
    expect(near).toMatchObject({ class: "log", data: { driftYd: 2 } });
  });

  test("a teleport is its own passive row", () => {
    expect(
      controlDrafts(
        control("server_correction", 100, "teleport"),
        testRuleInput(),
      ),
    ).toEqual([
      {
        class: "passive",
        data: { reason: "teleport", to: { mapId: 530, x: 100, y: 0, z: 0 } },
        domain: "control",
        event: "control/teleport",
        text: "You were moved (teleport) to 100, 0.",
      },
    ]);
  });

  test("logs stops and place changes and drops the rest", () => {
    const rc = testRuleInput({
      lookup: testLookup({
        place: () => ({ area: "Fairbreeze Village", zone: "Eversong Woods" }),
      }),
    });
    expect(
      controlDrafts(control("movement_stopped", 3, "arrived"), rc)[0],
    ).toMatchObject({
      data: { cause: "arrived" },
      event: "control/move_stop",
      text: "You stop (arrived).",
    });
    expect(controlDrafts(control("place_changed", 3), rc)).toEqual([
      {
        class: "log",
        data: { area: "Fairbreeze Village", zone: "Eversong Woods" },
        domain: "control",
        event: "control/place_changed",
        text: "You entered Fairbreeze Village, Eversong Woods.",
      },
    ]);
    expect(controlDrafts(control("facing_changed", 3), rc)).toEqual([]);
  });
});

describe("vendorDrafts and trainerDrafts", () => {
  test("a purchase is passive with the item name", () => {
    const rc = testRuleInput({
      lookup: testLookup({ itemName: () => "Refreshing Spring Water" }),
    });
    expect(vendorDrafts(vendor("bought", bought), rc)).toEqual([
      {
        class: "passive",
        data: {
          cost: 25,
          count: 1,
          itemId: 159,
          name: "Refreshing Spring Water",
          npc: "10",
          outcome: "confirmed",
          reason: undefined,
        },
        domain: "vendor",
        event: "vendor/buy",
        guid: "10",
        ref: "u16",
        text: "Vendor buy Refreshing Spring Water x1: confirmed.",
      },
    ]);
    expect(vendorDrafts(vendor("buy_requested", bought), rc)).toEqual([]);
  });

  test("a stack purchase names the items it gives", () => {
    const rc = testRuleInput({
      lookup: testLookup({ itemName: () => "Refreshing Spring Water" }),
    });
    const good = {
      buyCount: 5,
      displayId: 0,
      extendedCost: 0,
      itemId: 159,
      maxDurability: 0,
      price: 25,
      slot: 1,
      stock: null,
    };
    const window = {
      emptyReason: undefined,
      guid: 0x10n,
      invalidatedReason: undefined,
      items: [good],
      openedAt: 0,
    };
    const event: VendorEvent = {
      at: 0,
      state: { ...vendorBase, lastOutcome: bought, window },
      type: "bought",
    };
    expect(vendorDrafts(event, rc)[0]).toMatchObject({
      data: { count: 1, items: 5 },
      text: "Vendor buy Refreshing Spring Water x1 (5 items): confirmed.",
    });
  });

  test("a vendor list is a log row", () => {
    const window = {
      emptyReason: undefined,
      guid: 0x10n,
      invalidatedReason: undefined,
      items: [],
      openedAt: 0,
    };
    const event: VendorEvent = {
      at: 0,
      state: { ...vendorBase, window },
      type: "listed",
    };
    expect(vendorDrafts(event, testRuleInput())[0]).toMatchObject({
      class: "log",
      data: { items: 0, npc: "10" },
      event: "vendor/list",
      text: "The vendor lists 0 items.",
    });
  });

  test("a vendor list repeats only when it changed for that NPC", () => {
    const listed = (guid: bigint, itemIds: number[]): VendorEvent => ({
      at: 0,
      state: {
        ...vendorBase,
        window: {
          emptyReason: undefined,
          guid,
          invalidatedReason: undefined,
          items: itemIds.map((itemId, slot) => ({
            buyCount: 1,
            displayId: 0,
            extendedCost: 0,
            itemId,
            maxDurability: 0,
            price: 25,
            slot,
            stock: null,
          })),
          openedAt: 0,
        },
      },
      type: "listed",
    });
    const rc = testRuleInput();
    expect(vendorDrafts(listed(0x10n, [159, 4540]), rc)).toHaveLength(1);
    expect(vendorDrafts(listed(0x10n, [159, 4540]), rc)).toEqual([]);
    expect(vendorDrafts(listed(0x11n, [159, 4540]), rc)).toHaveLength(1);
    expect(vendorDrafts(listed(0x10n, [159]), rc)).toHaveLength(1);
  });

  test("a vendor list row carries the item names", () => {
    const good = (slot: number, itemId: number) => ({
      buyCount: 1,
      displayId: 0,
      extendedCost: 0,
      itemId,
      maxDurability: 0,
      price: 25,
      slot,
      stock: null,
    });
    const window = {
      emptyReason: undefined,
      guid: 0x10n,
      invalidatedReason: undefined,
      items: [good(1, 117), good(2, 1179)],
      openedAt: 0,
    };
    const names: Record<number, string> = { 117: "Tough Jerky" };
    const rc = testRuleInput({
      lookup: testLookup({ itemName: (itemId) => names[itemId] }),
    });
    const event: VendorEvent = {
      at: 0,
      state: { ...vendorBase, window },
      type: "listed",
    };
    expect(vendorDrafts(event, rc)[0]).toMatchObject({
      data: { items: 2, names: ["Tough Jerky", "item 1179"], npc: "10" },
      text: "The vendor lists 2 items: Tough Jerky, item 1179.",
    });
  });

  test("a trained spell is passive; a list is log", () => {
    expect(
      trainerDrafts(trainer("trained", true), testRuleInput())[0],
    ).toMatchObject({
      class: "passive",
      data: { cost: 100, learned: [591], outcome: "confirmed", spellId: 591 },
      event: "trainer/learn",
      text: "Train spell 591: confirmed.",
    });
    expect(
      trainerDrafts(trainer("listed", true), testRuleInput())[0],
    ).toMatchObject({
      class: "log",
      event: "trainer/list",
      text: "The trainer lists 0 spells.",
    });
    expect(
      trainerDrafts(trainer("train_requested", true), testRuleInput()),
    ).toEqual([]);
  });
});

describe("entity, packet and notice rules", () => {
  test("entity rows only with --log-entities", () => {
    const entity = {
      entry: 15_366,
      guid: 0x2an,
      name: "Springpaw Stalker",
      objectType: ObjectType.UNIT,
      position: undefined,
      rawFields: new Map(),
      scale: 1,
    };
    const on = { ...testRuleInput(), logEntities: true };
    expect(
      entityDrafts({ entity, type: "appear" }, { ...on, logEntities: false }),
    ).toEqual([]);
    expect(entityDrafts({ entity, type: "appear" }, on)).toEqual([
      {
        class: "log",
        data: {
          entry: 15_366,
          name: "Springpaw Stalker",
          objectType: ObjectType.UNIT,
        },
        domain: "entity",
        event: "entity/appear",
        guid: "2a",
        text: "Springpaw Stalker came into view.",
      },
    ]);
    expect(
      entityDrafts(
        { guid: 0x2an, name: "Springpaw Stalker", type: "disappear" },
        on,
      )[0],
    ).toMatchObject({
      event: "entity/disappear",
      guid: "2a",
      text: "Springpaw Stalker left view.",
    });
    expect(
      entityDrafts({ changed: ["health"], entity, type: "update" }, on),
    ).toEqual([]);
  });

  test("packet errors and notices are log rows", () => {
    expect(
      packetErrorDrafts(0x1_f6, new Error("short read"), testRuleInput()),
    ).toEqual([
      {
        class: "log",
        data: { message: "short read", opcode: 0x1_f6 },
        domain: "packet",
        event: "packet/error",
        text: "Packet 0x1f6 failed: short read",
      },
    ]);
    const notice = {
      at: 42,
      label: "SMSG_FOO",
      opcode: 0x1_23,
      text: "[tuicraft] SMSG_FOO is not yet implemented",
      type: "not_implemented" as const,
    };
    expect(noticeDrafts(notice, testRuleInput())).toEqual([
      {
        class: "log",
        data: { label: "SMSG_FOO", opcode: 0x1_23 },
        domain: "notice",
        event: "notice/not_implemented",
        text: notice.text,
        ts: 42,
      },
    ]);
  });
});
