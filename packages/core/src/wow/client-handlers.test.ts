import { describe, expect, jest, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import { MARNIEL, MARNIEL_LIST_INVENTORY } from "#test-support/vendor-fixtures";
import { extrasMethods, type NoticeEvent } from "#wow/client-extras";
import {
  NOTICE_BACKLOG,
  registerGameHandlers,
  registerWorldHandlers,
} from "#wow/client-handlers";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import { STUBS } from "#wow/protocol/stubs";
import { OpcodeDispatch } from "#wow/protocol/world";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";
import { createWorldEvents } from "#wow/world-events";

describe("registerGameHandlers", () => {
  test("leaves every stubbed opcode without a real handler", () => {
    const dispatch = new OpcodeDispatch();
    registerGameHandlers({ dispatch } as unknown as WorldConn, testStores());
    const names = new Map<number, string>(
      Object.entries(GameOpcode).map(([name, value]) => [value, name]),
    );
    const shadowed = STUBS.filter(([opcode]) => dispatch.has(opcode)).map(
      ([opcode]) => names.get(opcode),
    );
    expect(shadowed).toEqual([]);
  });
});

describe("registerWorldHandlers", () => {
  test("registers each opcode exactly once across every module", () => {
    const counts = new Map<number, number>();
    const dispatch = {
      has: (opcode: number) => counts.has(opcode),
      on: (opcode: number) => counts.set(opcode, (counts.get(opcode) ?? 0) + 1),
      onUnhandled: () => {},
    };
    const events = { message: { size: 0, emit: () => {} } };
    registerWorldHandlers(
      { dispatch, events } as unknown as WorldConn,
      testStores(),
    );
    const names = new Map<number, string>(
      Object.entries(GameOpcode).map(([name, value]) => [value, name]),
    );
    const duplicates = [...counts]
      .filter(([, count]) => count > 1)
      .map(([opcode]) => names.get(opcode) ?? `0x${opcode.toString(16)}`);
    expect(duplicates).toEqual([]);
  });

  test("routes a vendor list to both the quest request and the vendor window", () => {
    const dispatch = new OpcodeDispatch();
    const stores = testStores();
    const receiveWindow = jest.spyOn(stores.quests, "receiveWindow");
    const events = { message: { size: 0, emit: () => {} } };
    registerWorldHandlers({ dispatch, events } as unknown as WorldConn, stores);
    dispatch.handle(
      GameOpcode.SMSG_LIST_INVENTORY,
      new PacketReader(MARNIEL_LIST_INVENTORY),
    );
    expect(receiveWindow.mock.calls).toEqual([[MARNIEL, "vendor"]]);
    expect(stores.vendor.snapshot().window).toMatchObject({
      guid: MARNIEL,
      emptyReason: undefined,
    });
  });
});

function stubConn(): WorldConn {
  const conn = {
    dispatch: new OpcodeDispatch(),
    events: createWorldEvents(),
    pendingNotices: [],
  } as unknown as WorldConn;
  registerWorldHandlers(conn, testStores());
  return conn;
}

function weather(): PacketReader {
  return new PacketReader(new Uint8Array(0));
}

describe("stub notices", () => {
  test("a stubbed opcode emits a notice, not a chat line", () => {
    const conn = stubConn();
    const chat: string[] = [];
    const notices: NoticeEvent[] = [];
    conn.events.message.subscribe((msg) => chat.push(msg.message));
    conn.events.notice.subscribe((event) => notices.push(event));
    conn.dispatch.handle(GameOpcode.SMSG_WEATHER, weather());
    expect(chat).toEqual([]);
    expect(notices).toMatchObject([
      {
        type: "not_implemented",
        opcode: GameOpcode.SMSG_WEATHER,
        label: "Weather change",
        text: "[peon] Weather change is not yet implemented",
      },
    ]);
  });

  test("a notice with no subscriber replays to the first onNotice subscriber", () => {
    const conn = stubConn();
    const now = jest.spyOn(Date, "now").mockReturnValue(1000);
    conn.dispatch.handle(GameOpcode.SMSG_WEATHER, weather());
    now.mockReturnValue(5000);
    const { onNotice } = extrasMethods(conn, {} as Runtimes);
    const first: NoticeEvent[] = [];
    const second: NoticeEvent[] = [];
    onNotice((event) => first.push(event));
    onNotice((event) => second.push(event));
    conn.dispatch.handle(GameOpcode.SMSG_WEATHER, weather());
    now.mockRestore();
    expect(first).toMatchObject([
      { at: 1000, opcode: GameOpcode.SMSG_WEATHER },
    ]);
    expect(second).toEqual([]);
  });

  test("a full backlog leaves later notices to retry on their next packet", () => {
    const conn = stubConn();
    for (let opcode = 0x7_00; opcode < 0x7_00 + NOTICE_BACKLOG; opcode++)
      conn.dispatch.handle(opcode, weather());
    conn.dispatch.handle(GameOpcode.SMSG_WEATHER, weather());
    const notices: NoticeEvent[] = [];
    extrasMethods(conn, {} as Runtimes).onNotice((event) =>
      notices.push(event),
    );
    conn.dispatch.handle(GameOpcode.SMSG_WEATHER, weather());
    expect(notices).toHaveLength(NOTICE_BACKLOG + 1);
    expect(notices.at(-1)).toMatchObject({ opcode: GameOpcode.SMSG_WEATHER });
  });

  test("an opcode nothing handles emits one notice by its name", () => {
    const conn = stubConn();
    const notices: NoticeEvent[] = [];
    conn.events.notice.subscribe((event) => notices.push(event));
    conn.dispatch.handle(GameOpcode.SMSG_SPELLLOGEXECUTE, weather());
    conn.dispatch.handle(GameOpcode.SMSG_SPELLLOGEXECUTE, weather());
    conn.dispatch.handle(0x7_ff, weather());
    expect(notices).toMatchObject([
      {
        opcode: GameOpcode.SMSG_SPELLLOGEXECUTE,
        text: "[peon] SMSG_SPELLLOGEXECUTE is not yet implemented",
      },
      { label: "Opcode 0x7ff", opcode: 0x7_ff },
    ]);
  });
});
