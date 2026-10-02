import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type ComplaintDetail =
  | {
      kind: "mail";
      mailId: number;
    }
  | ({
      kind: "chat";
      text: string;
    } & ChatFields);

export type ChatFields = {
  language: number;
  chatType: number;
  channelId: number;
  secondsAgo: number;
};

export type ComplainResult = { code: number };

export function buildComplainMail(guid: bigint, mailId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(0);
  w.uint64LE(guid);
  w.uint32LE(0);
  w.uint32LE(mailId);
  w.uint32LE(0);
  return w.finish();
}

export function buildComplainChat(
  guid: bigint,
  chat: ChatFields & { text: string },
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(1);
  w.uint64LE(guid);
  w.uint32LE(chat.language);
  w.uint32LE(chat.chatType);
  w.uint32LE(chat.channelId);
  w.uint32LE(chat.secondsAgo);
  w.cString(chat.text);
  return w.finish();
}

export function parseComplainResult(r: PacketReader): ComplainResult {
  const code = r.uint8();
  return { code };
}
