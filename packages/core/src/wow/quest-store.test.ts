import { describe, expect, test } from "bun:test";
import { dialog, packet, questId, setup } from "#test-support/quest-fixtures";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";

function detailsBody(giverGuid: bigint, dividerGuid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(giverGuid);
  w.uint64LE(dividerGuid);
  w.uint32LE(questId);
  w.cString("Quest");
  w.cString("Text");
  w.cString("Objectives");
  w.uint8(1);
  w.uint32LE(0);
  w.uint32LE(0);
  w.uint8(0);
  for (let i = 0; i < 4; i++) w.uint32LE(0);
  w.uint32LE(0);
  w.floatLE(0);
  for (let i = 0; i < 6; i++) w.uint32LE(0);
  for (let i = 0; i < 15; i++) w.uint32LE(0);
  w.uint32LE(0);
  return w.finish();
}

describe("quest store shared details dialogs", () => {
  test("a details dialog with a divider and no giver leaves lastError unset", () => {
    const { events, runtime, store } = setup();
    packet(
      store,
      GameOpcode.SMSG_QUESTGIVER_QUEST_DETAILS,
      detailsBody(1n, 9n),
    );
    expect(runtime.snapshot().lastError).toBeUndefined();
    expect(events.filter((event) => event.type === "error")).toEqual([]);
  });

  test("a details dialog without a divider and no giver still records stale_dialog", () => {
    const { runtime, store } = setup();
    packet(store, GameOpcode.SMSG_QUESTGIVER_QUEST_DETAILS, dialog("details"));
    expect(runtime.snapshot().lastError?.kind).toBe("stale_dialog");
  });

  test("a divider details dialog from another giver still records stale_dialog", () => {
    const { runtime, store } = setup();
    runtime.talk(3n);
    packet(
      store,
      GameOpcode.SMSG_QUESTGIVER_QUEST_DETAILS,
      detailsBody(1n, 9n),
    );
    expect(runtime.snapshot().lastError?.kind).toBe("stale_dialog");
  });
});
