import { GameOpcode } from "#wow/protocol/opcodes";
import type { OpcodeDispatch } from "#wow/protocol/world";

export type TraceOutcome = "handled" | "unhandled" | "error" | "skipped";

export type TraceRow = {
  at: number;
  dir: "in" | "out";
  opcode: number;
  size: number;
  body?: string;
  via?: "compressed";
  outcome?: TraceOutcome;
};

export type TraceSender = (opcode: number, body?: Uint8Array) => void;

export type OpcodeCounts = Record<string, number>;

export type PacketCounts = {
  seen: OpcodeCounts;
  unhandled: OpcodeCounts;
  sent: OpcodeCounts;
};

export type TraceSink = {
  bodies: boolean;
  row: (row: TraceRow) => void;
  attach?: (send: TraceSender) => void;
  close?: (counts: PacketCounts) => void;
};

export type PacketTap = { sink: TraceSink; sent: Map<number, number> };

export type Packet = { opcode: number; body: Uint8Array };

export type Inbound = Packet & {
  outcome: TraceOutcome;
  at?: number;
  via?: "compressed";
};

const NAMES = new Map<number, string>(
  Object.entries(GameOpcode).map(([name, opcode]) => [opcode, name]),
);

export function opcodeName(opcode: number): string {
  return NAMES.get(opcode) ?? `0x${opcode.toString(16).padStart(3, "0")}`;
}

const NUMBERS = new Map<string, number>(Object.entries(GameOpcode));
const HEX_OPCODE = /^0x[0-9a-f]{1,4}$/i;

export function opcodeNumber(text: string): number | undefined {
  if (HEX_OPCODE.test(text)) return Number.parseInt(text.slice(2), 16);
  return NUMBERS.get(text);
}

export function createTap(sink: TraceSink | undefined): PacketTap | undefined {
  return sink && { sent: new Map(), sink };
}

export function traceIn(tap: PacketTap | undefined, packet: Inbound): void {
  if (!tap) return;
  const { opcode, body, outcome, at = Date.now(), via } = packet;
  const size = body.byteLength;
  const row = { at, dir: "in" as const, opcode, size };
  tap.sink.row({
    ...row,
    ...(via && { via }),
    outcome,
    ...bodyOf(tap, packet),
  });
}

export function traceOut(tap: PacketTap | undefined, packet: Packet): void {
  if (!tap) return;
  const { opcode, body } = packet;
  tap.sent.set(opcode, (tap.sent.get(opcode) ?? 0) + 1);
  const row = {
    at: Date.now(),
    dir: "out" as const,
    opcode,
    size: body.byteLength,
  };
  tap.sink.row({ ...row, ...bodyOf(tap, packet) });
}

export function closeTap(
  tap: PacketTap | undefined,
  dispatch: Pick<OpcodeDispatch, "counts">,
): void {
  if (!tap) return;
  const { seen, unhandled } = dispatch.counts();
  const counts = {
    seen: named(seen),
    sent: named(tap.sent),
    unhandled: named(unhandled),
  };
  tap.sink.close?.(counts);
}

function bodyOf(tap: PacketTap, { opcode, body }: Packet): { body?: string } {
  if (!tap.sink.bodies || opcode === GameOpcode.CMSG_AUTH_SESSION) return {};
  return { body: Buffer.from(body).toString("hex") };
}

function named(counts: ReadonlyMap<number, number>): OpcodeCounts {
  return Object.fromEntries(
    [...counts].map(([opcode, n]) => [opcodeName(opcode), n]),
  );
}
