import { describe, expect, test } from "bun:test";
import { CombatCasts } from "#wow/combat-casts";
import { CooldownStore } from "#wow/cooldown-store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import type { SpellGo } from "#wow/protocol/spell";

const MISSILES = 5143;
const BOLT = 133;
const MOB = 0xf1_30_00_3e_ea_00_0a_bcn;
const ITEM = {
  bag: 255,
  entry: 6948,
  guid: 0x40_00_00_00_00_00_01_00n,
  slot: 23,
};

type Sent = { opcode: number; body: Uint8Array };

function setup() {
  let now = 1000;
  const sent: Sent[] = [];
  const casts = new CombatCasts({
    cooldowns: new CooldownStore(
      () => now,
      () => undefined,
    ),
    learned: new Set([MISSILES, BOLT]),
    now: () => now,
  });
  const send = (opcode: number, body?: Uint8Array) => {
    sent.push({ body: body ?? new Uint8Array(), opcode });
  };
  return {
    advance: (ms: number) => {
      now += ms;
    },
    casts,
    send,
    sent,
  };
}

function go(spellId: number, extraCasts: number): SpellGo {
  return {
    castItem: 0n,
    caster: 0x2an,
    extraCasts,
    flags: 0,
    hits: [MOB],
    misses: [],
    spellId,
    targets: { flags: 2, objectGuid: MOB },
    timestamp: 0,
  };
}

function channelling() {
  const parts = setup();
  parts.casts.send(parts.send, MISSILES, MOB);
  parts.casts.succeed(go(MISSILES, 1));
  parts.casts.beginChannel({
    durationMs: 3000,
    spellId: MISSILES,
    target: undefined,
  });
  return parts;
}

describe("CombatCasts channels", () => {
  test("beginChannel after the spell go holds the channel with the cast's target", () => {
    const { casts } = channelling();
    expect(casts.casting).toBeUndefined();
    expect(casts.pending).toBeUndefined();
    expect(casts.channel).toMatchObject({
      durationMs: 3000,
      spellId: MISSILES,
      startedAt: 1000,
      target: MOB,
    });
    expect(casts.hasUncancelled()).toBe(true);
  });

  test("cancel with only a channel sends CMSG_CANCEL_CHANNELLING for its spell", () => {
    const { casts, send, sent } = channelling();
    expect(casts.cancel(send)).toMatchObject({
      kind: "cancel",
      spellId: MISSILES,
      status: "sent",
    });
    expect(sent.at(-1)?.opcode).toBe(GameOpcode.CMSG_CANCEL_CHANNELLING);
    expect(
      new PacketReader(sent.at(-1)?.body ?? new Uint8Array()).uint32LE(),
    ).toBe(MISSILES);
    expect(casts.channel?.cancelRequested).toBe(true);
    expect(casts.hasUncancelled()).toBe(false);
  });

  test("the spell failure after a channel cancel reads as a cancel", () => {
    const { casts, send } = channelling();
    casts.cancel(send);
    expect(casts.fail(MISSILES, 1, 40, "interrupted")).toMatchObject({
      kind: "cancel",
      spellId: MISSILES,
      status: "interrupted",
    });
  });

  test("cancel with a pending cast still sends CMSG_CANCEL_CAST", () => {
    const { casts, send, sent } = setup();
    casts.send(send, BOLT, MOB);
    casts.cancel(send);
    expect(sent.map((p) => p.opcode)).toEqual([
      GameOpcode.CMSG_CAST_SPELL,
      GameOpcode.CMSG_CANCEL_CAST,
    ]);
  });

  test("a new cast or item use is refused while the channel runs", () => {
    const { casts, send, sent } = channelling();
    const before = sent.length;
    expect(() => casts.send(send, BOLT, MOB)).toThrow("channelling");
    expect(() => casts.sendItem(send, BOLT, ITEM)).toThrow("channelling");
    expect(sent.length).toBe(before);
  });

  test("sendItem writes the glyph index after the item guid", () => {
    const { casts, send, sent } = setup();
    casts.sendItem(send, BOLT, { ...ITEM, glyphIndex: 4 });
    const body = sent.find((p) => p.opcode === GameOpcode.CMSG_USE_ITEM)?.body;
    const r = new PacketReader(body ?? new Uint8Array());
    r.uint8();
    r.uint8();
    r.uint8();
    expect(r.uint32LE()).toBe(BOLT);
    expect(r.uint64LE()).toBe(ITEM.guid);
    expect(r.uint32LE()).toBe(4);
  });

  test("updateChannel keeps the remaining time and moves the expected end", () => {
    const { advance, casts } = channelling();
    advance(1000);
    casts.updateChannel(2750);
    expect(casts.channel).toMatchObject({ endsAt: 4750, remainingMs: 2750 });
  });

  test("endChannel returns the channel and frees the tracker", () => {
    const { casts, send } = channelling();
    expect(casts.endChannel()?.spellId).toBe(MISSILES);
    expect(casts.channel).toBeUndefined();
    expect(casts.endChannel()).toBeUndefined();
    expect(() => casts.send(send, BOLT, MOB)).not.toThrow();
  });

  test("clear drops the channel", () => {
    const { casts } = channelling();
    casts.clear();
    expect(casts.channel).toBeUndefined();
    expect(casts.hasUncancelled()).toBe(false);
  });

  test("a channel whose end never came stops blocking casts after its expected end", () => {
    const { advance, casts, send } = channelling();
    advance(3000);
    expect(() => casts.send(send, BOLT, MOB)).toThrow("channelling");
    advance(5000);
    expect(casts.channel).toBeUndefined();
    expect(() => casts.send(send, BOLT, MOB)).not.toThrow();
  });

  test("an endless channel keeps blocking until it ends", () => {
    const { advance, casts, send } = setup();
    casts.beginChannel({
      durationMs: undefined,
      spellId: MISSILES,
      target: MOB,
    });
    advance(600_000);
    expect(() => casts.send(send, BOLT, MOB)).toThrow("channelling");
  });
});

describe("CombatCasts cooldown shift", () => {
  test("shiftCooldown moves the spell's cooldown in the cooldown store", () => {
    const now = 1000;
    const cooldowns = new CooldownStore(
      () => now,
      () => undefined,
    );
    const casts = new CombatCasts({
      cooldowns,
      learned: new Set([BOLT]),
      now: () => now,
    });
    cooldowns.observe(BOLT, 6000);
    casts.shiftCooldown(BOLT, -2000);
    expect(cooldowns.readyAt(BOLT)).toBe(5000);
  });
});
