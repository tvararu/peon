import { describe, expect, test } from "bun:test";
import { extrasMethods, type NoticeEvent } from "#wow/client-extras";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";
import { createWorldEvents } from "#wow/world-events";

const notice: NoticeEvent = {
  type: "not_implemented",
  opcode: GameOpcode.SMSG_WEATHER,
  label: "Weather change",
  text: "[tuicraft] Weather change is not yet implemented",
  at: 1,
};

function extras() {
  const conn = { events: createWorldEvents() } as unknown as WorldConn;
  return { conn, methods: extrasMethods(conn, {} as Runtimes) };
}

describe("extrasMethods", () => {
  test("onNotice delivers notice events until unsubscribed", () => {
    const { conn, methods } = extras();
    const seen: NoticeEvent[] = [];
    const off = methods.onNotice((event) => seen.push(event));
    conn.events.notice.emit(notice);
    off();
    conn.events.notice.emit(notice);
    expect(seen).toEqual([notice]);
  });

  test("capabilities come from the runtimes", () => {
    const flags = {
      factions: true,
      spells: false,
      navigation: true,
      jev: false,
    };
    const conn = { events: createWorldEvents() } as unknown as WorldConn;
    const rt = { capabilities: () => flags } as unknown as Runtimes;
    expect(extrasMethods(conn, rt).capabilities()).toEqual(flags);
  });

  test("getCreatureInfo is not implemented yet", () => {
    const { methods } = extras();
    expect(() => methods.getCreatureInfo(1)).toThrow("not_implemented");
  });
});
