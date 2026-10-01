import { describe, expect, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import { EntityStore } from "#wow/entity-store";
import { registerMovementHandlers } from "#wow/movement-handlers";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";
import { OpcodeDispatch } from "#wow/protocol/world";
import { RemoteMotion } from "#wow/remote-motion";
import type { SelfEvent } from "#wow/self-store";
import type { WorldConn } from "#wow/world-conn";

function conn(): WorldConn {
  return {
    dispatch: new OpcodeDispatch(),
    entityStore: new EntityStore(),
    remoteMotion: new RemoteMotion({
      dead: () => false,
      eligible: () => false,
      emit: () => undefined,
      now: () => 0,
    }),
    selfGuidHigh: 0,
    selfGuidLow: 0x07_64,
  } as unknown as WorldConn;
}

function pendingEvent(...words: number[]): SelfEvent | undefined {
  const stores = testStores();
  const events: SelfEvent[] = [];
  stores.self.onEvent((event) => events.push(event));
  const c = conn();
  registerMovementHandlers(c, stores);
  const w = new PacketWriter();
  for (const word of words) w.uint32LE(word);
  c.dispatch.handle(
    GameOpcode.SMSG_TRANSFER_PENDING,
    new PacketReader(w.finish()),
  );
  return events.find((event) => event.type === "transfer_pending");
}

describe("SMSG_TRANSFER_PENDING body", () => {
  test("a plain transfer carries only the destination map", () => {
    expect(pendingEvent(530)).toEqual({ mapId: 530, type: "transfer_pending" });
  });

  test("a transfer on a transport carries its entry and the old map", () => {
    expect(pendingEvent(530, 20_808, 1)).toEqual({
      mapId: 530,
      transport: { entry: 20_808, fromMap: 1 },
      type: "transfer_pending",
    });
  });

  test("an empty body does not stop the transfer gate", () => {
    const stores = testStores();
    const events: SelfEvent[] = [];
    stores.self.onEvent((event) => events.push(event));
    const c = conn();
    registerMovementHandlers(c, stores);
    c.dispatch.handle(
      GameOpcode.SMSG_TRANSFER_PENDING,
      new PacketReader(new Uint8Array()),
    );
    expect(events.map((event) => event.type)).toEqual(["transfer_pending"]);
  });
});
