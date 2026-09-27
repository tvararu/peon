import { expect, jest, test } from "bun:test";
import { combatParts, testStores } from "#test-support/session-fixtures";
import {
  ARCANE_SHOT,
  AUTO_SHOT,
  HUNTER_SPELLS,
  hunterSpells,
} from "#test-support/spell-fixtures";
import { writePackedGuid } from "#test-support/world-handlers-fixtures";
import type { CombatEvent } from "#wow/combat";
import { registerCombatHandlers } from "#wow/gameplay-handlers";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";
import type { SpellGo, SpellStart } from "#wow/protocol/spell";
import { OpcodeDispatch } from "#wow/protocol/world";
import type { WorldConn } from "#wow/world-conn";

function setup() {
  let now = 1000;
  const sent: { opcode: number; body: Uint8Array | undefined }[] = [];
  const {
    combat,
    store: combatStore,
    motion,
  } = combatParts({
    getEntity: () => undefined,
    now: () => now,
    selectedGuid: () => 2n,
    selfGuid: () => 1n,
    selfPose: () => undefined,
    send: (opcode, body) => {
      sent.push({ body, opcode });
    },
  });
  const defs = hunterSpells();
  jest.spyOn(combatStore, "definition").mockImplementation((id) => defs[id]);
  combatStore.applyInitialSpells({
    cooldowns: [],
    spells: HUNTER_SPELLS.map((spellId) => ({ spellId })),
  });
  const events: CombatEvent[] = [];
  combat.onEvent((event) => events.push(event));
  const advance = (ms: number) => {
    now += ms;
  };
  return { advance, combat, combatStore, events, motion, sent };
}

function start(castCount: number): SpellStart {
  return {
    castCount,
    castItem: 1n,
    caster: 1n,
    flags: 0x20,
    spellId: AUTO_SHOT,
    targets: { flags: 2, objectGuid: 2n },
    timer: 0,
  };
}

function shot(): SpellGo {
  return {
    castItem: 1n,
    caster: 1n,
    extraCasts: 0,
    flags: 0x20,
    hits: [2n],
    misses: [],
    spellId: AUTO_SHOT,
    targets: { flags: 2, objectGuid: 2n },
    timestamp: 0,
  };
}

test("Auto Shot is an auto-repeat attack, not a cast that never ends", () => {
  const { advance, combat, events, sent, combatStore } = setup();
  combat.cast(AUTO_SHOT, 2n);
  const request = new PacketReader(sent[0]?.body ?? new Uint8Array());
  expect(sent[0]?.opcode).toBe(GameOpcode.CMSG_CAST_SPELL);
  expect([request.uint8(), request.uint32LE(), request.uint8()]).toEqual([
    1,
    AUTO_SHOT,
    0,
  ]);
  expect(combat.snapshot().pendingCast).toBeUndefined();
  expect(combat.snapshot().autoRepeat).toEqual({
    shots: 0,
    spellId: AUTO_SHOT,
    startedAt: 1000,
    status: "pending",
    target: 2n,
  });
  combatStore.applySpellStart(start(1));
  expect(combat.snapshot().casting).toBeUndefined();
  expect(combat.snapshot().autoRepeat?.status).toBe("active");
  advance(2500);
  combatStore.applySpellGo(shot());
  combatStore.applySpellGo(shot());
  expect(combat.snapshot().autoRepeat).toMatchObject({
    lastShotAt: 3500,
    shots: 2,
    status: "active",
  });
  expect(combat.snapshot().lastOutcome).toMatchObject({
    hits: [2n],
    kind: "cast",
    spellId: AUTO_SHOT,
    status: "succeeded",
  });
  expect(
    events.filter((event) => event.type === "cast_succeeded"),
  ).toHaveLength(2);
  expect(combat.readyAt(ARCANE_SHOT)).toBeLessThanOrEqual(3500);
  combat.cast(ARCANE_SHOT, 2n);
  expect(combat.snapshot().pendingCast?.spellId).toBe(ARCANE_SHOT);
  expect(combat.snapshot().autoRepeat?.status).toBe("active");
});

test("the server's SMSG_CANCEL_AUTO_REPEAT ends the auto-repeat", () => {
  const { combat, combatStore } = setup();
  combat.cast(AUTO_SHOT, 2n);
  combatStore.applySpellStart(start(1));
  combatStore.applyCancelAutoRepeat({ target: 1n });
  expect(combat.snapshot().autoRepeat).toBeUndefined();
  expect(combat.snapshot().lastOutcome).toMatchObject({
    kind: "cancel",
    reason: "auto_repeat_cancelled",
    spellId: AUTO_SHOT,
    status: "succeeded",
  });
});

test("stop and halt send CMSG_CANCEL_AUTO_REPEAT_SPELL with an empty body", () => {
  const { combat, sent, combatStore } = setup();
  combat.cast(AUTO_SHOT, 2n);
  combatStore.applySpellStart(start(1));
  combat.stopAutoRepeat();
  expect(sent.at(-1)?.opcode).toBe(GameOpcode.CMSG_CANCEL_AUTO_REPEAT_SPELL);
  expect(sent.at(-1)?.body?.byteLength ?? 0).toBe(0);
  expect(combat.snapshot().autoRepeat).toBeUndefined();
  combat.cast(AUTO_SHOT, 2n);
  sent.length = 0;
  combat.halt();
  expect(sent.map((entry) => entry.opcode)).toEqual([
    GameOpcode.CMSG_CANCEL_AUTO_REPEAT_SPELL,
  ]);
  expect(combat.snapshot().autoRepeat).toBeUndefined();
});

test("a rejected Auto Shot clears the auto-repeat with the server reason", () => {
  const { combat, events, combatStore } = setup();
  combat.cast(AUTO_SHOT, 2n);
  combatStore.applyCastFailed({
    castCount: 1,
    extra: [],
    result: 75,
    spellId: AUTO_SHOT,
  });
  expect(combat.snapshot().autoRepeat).toBeUndefined();
  expect(combat.snapshot().lastOutcome).toMatchObject({
    reason: "no_ammo",
    spellId: AUTO_SHOT,
    status: "failed",
  });
  expect(events.at(-1)?.type).toBe("cast_failed");
});

test("the SMSG_CANCEL_AUTO_REPEAT handler reads the wire packet", () => {
  const { combat, combatStore, motion } = setup();
  const conn = { dispatch: new OpcodeDispatch() } as unknown as WorldConn;
  registerCombatHandlers(conn, {
    ...testStores(),
    combat: combatStore,
    motion,
  });
  combat.cast(AUTO_SHOT, 2n);
  conn.dispatch.handle(
    GameOpcode.SMSG_SPELL_START,
    new PacketReader(spellStartBytes()),
  );
  expect(combat.snapshot().autoRepeat?.status).toBe("active");
  expect(combat.snapshot().casting).toBeUndefined();
  conn.dispatch.handle(
    GameOpcode.SMSG_CANCEL_AUTO_REPEAT,
    new PacketReader(Uint8Array.from([0x01, 0x01])),
  );
  expect(combat.snapshot().autoRepeat).toBeUndefined();
});

function spellStartBytes(): Uint8Array {
  const w = new PacketWriter();
  writePackedGuid(w, 1n);
  writePackedGuid(w, 1n);
  w.uint8(1);
  w.uint32LE(AUTO_SHOT);
  w.uint32LE(0x20);
  w.uint32LE(0);
  w.uint32LE(2);
  writePackedGuid(w, 2n);
  w.uint32LE(5996);
  w.uint32LE(24);
  return w.finish();
}
