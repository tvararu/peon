import { describe, expect, jest, test } from "bun:test";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import { dispatchCommand, type EventEntry } from "#daemon/commands";
import { RingBuffer } from "#lib/ring-buffer";
import { createMockSocket } from "#test-support/commands-fixtures";

describe("combat json", () => {
  test("lists attackers as hex guids", async () => {
    const handle = createMockHandle();
    const base = handle.getCombatState();
    handle.getCombatState = jest.fn(() => ({
      ...base,
      attackers: [0xf1_30_00_3d_23_07_40_1fn],
    }));
    const socket = createMockSocket();
    await dispatchCommand(
      { type: "combat_json" },
      {
        cleanup: jest.fn(),
        events: new RingBuffer<EventEntry>(10),
        handle,
        socket,
      },
    );
    const parsed = JSON.parse(socket.written().trim());
    expect(parsed.attackers).toEqual(["0xf130003d2307401f"]);
  });
});
