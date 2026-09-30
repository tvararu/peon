import { describe, expect, test } from "bun:test";
import { STUB_EXAMPLE, STUB_EXAMPLE_LABEL } from "#test-support/never-handled";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import { registerStubs, STUBS, type StubNotice } from "#wow/protocol/stubs";
import { OpcodeDispatch } from "#wow/protocol/world";

const EXAMPLE = [[GameOpcode[STUB_EXAMPLE], STUB_EXAMPLE_LABEL]] as const;

describe("registerStubs", () => {
  test("leaves world states to the place handler", () => {
    expect(STUBS.map(([opcode]) => opcode)).not.toContain(
      GameOpcode.SMSG_INIT_WORLD_STATES,
    );
  });

  test("registers SMSG opcodes that aren't already handled", () => {
    const d = new OpcodeDispatch();
    d.on(GameOpcode.SMSG_MESSAGE_CHAT, () => {});
    registerStubs(d, () => true, EXAMPLE);

    expect(d.has(GameOpcode[STUB_EXAMPLE])).toBe(true);
  });

  test("skips opcodes already registered", () => {
    const d = new OpcodeDispatch();
    let realCalled = false;
    d.on(GameOpcode.SMSG_MESSAGE_CHAT, () => {
      realCalled = true;
    });
    registerStubs(d, () => true);

    d.handle(GameOpcode.SMSG_MESSAGE_CHAT, new PacketReader(new Uint8Array(0)));
    expect(realCalled).toBe(true);
  });

  test("notifies on first receipt only", () => {
    const d = new OpcodeDispatch();
    const messages: string[] = [];
    registerStubs(
      d,
      (notice) => {
        messages.push(notice.text);
        return true;
      },
      EXAMPLE,
    );

    d.handle(GameOpcode[STUB_EXAMPLE], new PacketReader(new Uint8Array(0)));
    d.handle(GameOpcode[STUB_EXAMPLE], new PacketReader(new Uint8Array(0)));

    const matching = messages.filter((m) => m.includes(STUB_EXAMPLE_LABEL));
    expect(matching).toHaveLength(1);
  });

  test("retries notification when notify returns false", () => {
    const d = new OpcodeDispatch();
    const messages: string[] = [];
    let ready = false;
    registerStubs(
      d,
      (notice) => {
        if (!ready) return false;
        messages.push(notice.text);
        return true;
      },
      EXAMPLE,
    );

    d.handle(GameOpcode[STUB_EXAMPLE], new PacketReader(new Uint8Array(0)));
    expect(messages).toHaveLength(0);

    ready = true;
    d.handle(GameOpcode[STUB_EXAMPLE], new PacketReader(new Uint8Array(0)));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(STUB_EXAMPLE_LABEL);

    d.handle(GameOpcode[STUB_EXAMPLE], new PacketReader(new Uint8Array(0)));
    expect(messages).toHaveLength(1);
  });

  test("the notice names the opcode, the label and the old text", () => {
    const d = new OpcodeDispatch();
    const notices: StubNotice[] = [];
    registerStubs(
      d,
      (notice) => {
        notices.push(notice);
        return true;
      },
      EXAMPLE,
    );
    d.handle(GameOpcode[STUB_EXAMPLE], new PacketReader(new Uint8Array(0)));
    expect(notices).toEqual([
      {
        opcode: GameOpcode[STUB_EXAMPLE],
        label: STUB_EXAMPLE_LABEL,
        text: `[peon] ${STUB_EXAMPLE_LABEL} is not yet implemented`,
      },
    ]);
  });

  test("lists only server opcodes", () => {
    const names = new Map<number, string>(
      Object.entries(GameOpcode).map(([name, value]) => [value, name]),
    );
    for (const [opcode] of STUBS)
      expect(names.get(opcode)).toMatch(/^(SMSG|MSG)_/);
  });
});
