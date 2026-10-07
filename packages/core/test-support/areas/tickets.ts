import { PacketWriter } from "#wow/protocol/packet";

export function ticketSystemBody(enabled: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(enabled ? 1 : 0);
  return w.finish();
}

export function ticketNoneBody(): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(0x0a);
  return w.finish();
}

export function ticketOpenBody(): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(0x06);
  w.uint32LE(7);
  w.cString("peon probe");
  w.uint8(0);
  w.floatLE(1.5);
  w.floatLE(2.5);
  w.floatLE(0.25);
  w.uint8(0);
  w.uint8(0);
  return w.finish();
}

export function ticketCodeBody(code: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(code);
  return w.finish();
}

export function gmResponseBody(message: string, response: string): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(1);
  w.uint32LE(7);
  w.cString(message);
  w.rawBytes(new TextEncoder().encode(response));
  w.uint8(0);
  w.uint8(0);
  w.uint8(0);
  w.uint8(0);
  return w.finish();
}

export function gmSurveyBody(offered: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint8(offered ? 1 : 0);
  return w.finish();
}
