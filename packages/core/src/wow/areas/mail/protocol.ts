import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export const MAX_MAIL_SENDER_ROWS = 2;
export const MAX_MAIL_ENCHANTS = 7;

export const MAIL_READ_FLAG = 0x01;
export const MAIL_RETURNED_FLAG = 0x02;
export const MAIL_COPIED_FLAG = 0x04;
export const MAIL_COD_PAYMENT_FLAG = 0x08;
export const MAIL_HAS_BODY_FLAG = 0x10;

export type MailSender =
  | { readonly kind: "player"; readonly guid: bigint }
  | { readonly kind: "entry"; readonly entry: number };

export type MailFlags = {
  readonly raw: number;
  readonly read: boolean;
  readonly returned: boolean;
  readonly copied: boolean;
  readonly codPayment: boolean;
  readonly hasBody: boolean;
};

export type MailItem = {
  readonly index: number;
  readonly guidLow: number;
  readonly entry: number;
  readonly enchants: readonly number[];
  readonly randomProperty: number;
  readonly suffixFactor: number;
  readonly count: number;
  readonly charges: number;
  readonly maxDurability: number;
  readonly durability: number;
};

export type MailEntry = {
  readonly id: number;
  readonly type: number;
  readonly sender: MailSender;
  readonly cod: number;
  readonly stationery: number;
  readonly money: number;
  readonly flags: MailFlags;
  readonly daysLeft: number;
  readonly template: number;
  readonly subject: string;
  readonly body: string;
  readonly items: readonly MailItem[];
};

export type MailList = {
  readonly realCount: number;
  readonly mails: readonly MailEntry[];
  readonly unreadable: number;
  readonly hidden: number;
};

export type NextMailSender = {
  readonly guid: bigint;
  readonly entry: number;
  readonly type: number;
  readonly stationery: number;
  readonly delay: number;
};

export type NextMailTime = {
  readonly delay: number;
  readonly count: number;
  readonly senders: readonly NextMailSender[];
  readonly unread: boolean;
};

export function mailFlags(raw: number): MailFlags {
  return {
    codPayment: (raw & MAIL_COD_PAYMENT_FLAG) !== 0,
    copied: (raw & MAIL_COPIED_FLAG) !== 0,
    hasBody: (raw & MAIL_HAS_BODY_FLAG) !== 0,
    raw,
    read: (raw & MAIL_READ_FLAG) !== 0,
    returned: (raw & MAIL_RETURNED_FLAG) !== 0,
  };
}

function parseSender(reader: PacketReader, type: number): MailSender {
  if (type === 0) return { guid: reader.uint64LE(), kind: "player" };
  return { entry: reader.uint32LE(), kind: "entry" };
}

function parseEnchants(reader: PacketReader): readonly number[] {
  const enchants: number[] = [];
  for (let j = 0; j < MAX_MAIL_ENCHANTS; j++) {
    const id = reader.uint32LE();
    reader.uint32LE();
    reader.uint32LE();
    enchants.push(id);
  }
  return enchants;
}

function parseItem(reader: PacketReader): MailItem {
  const index = reader.uint8();
  const guidLow = reader.uint32LE();
  const entry = reader.uint32LE();
  const enchants = parseEnchants(reader);
  const randomProperty = reader.int32LE();
  const suffixFactor = reader.uint32LE();
  const count = reader.uint32LE();
  const charges = reader.uint32LE();
  const maxDurability = reader.uint32LE();
  const durability = reader.uint32LE();
  reader.uint8();
  return {
    charges,
    count,
    durability,
    enchants,
    entry,
    guidLow,
    index,
    maxDurability,
    randomProperty,
    suffixFactor,
  };
}

function parseEntry(reader: PacketReader): MailEntry {
  const id = reader.uint32LE();
  const type = reader.uint8();
  const sender = parseSender(reader, type);
  const cod = reader.uint32LE();
  reader.uint32LE();
  const stationery = reader.uint32LE();
  const money = reader.uint32LE();
  const flags = mailFlags(reader.uint32LE());
  const daysLeft = reader.floatLE();
  const template = reader.uint32LE();
  const subject = reader.cString();
  const body = reader.cString();
  const itemCount = reader.uint8();
  const items: MailItem[] = [];
  for (let i = 0; i < itemCount; i++) items.push(parseItem(reader));
  return {
    body,
    cod,
    daysLeft,
    flags,
    id,
    items,
    money,
    sender,
    stationery,
    subject,
    template,
    type,
  };
}

export function parseMailList(reader: PacketReader): MailList {
  const realCount = reader.uint32LE();
  const shown = reader.uint8();
  const mails: MailEntry[] = [];
  let unreadable = 0;
  for (let i = 0; i < shown; i++) {
    const size = reader.uint16LE();
    if (size < 2 || size - 2 > reader.remaining) {
      unreadable += shown - i;
      break;
    }
    const start = reader.offset;
    const end = start + size - 2;
    const entryReader = reader.fork();
    try {
      const entry = parseEntry(entryReader);
      if (entryReader.offset > end)
        throw new Error("mail entry overruns its size");
      mails.push(entry);
    } catch {
      unreadable += 1;
    }
    if (reader.offset < end) reader.skip(end - reader.offset);
  }
  return {
    hidden: Math.max(0, realCount - shown),
    mails,
    realCount,
    unreadable,
  };
}

export function parseNextMailTime(reader: PacketReader): NextMailTime {
  const delay = reader.floatLE();
  const count = reader.uint32LE();
  const senders: NextMailSender[] = [];
  for (let i = 0; i < count && i < MAX_MAIL_SENDER_ROWS; i++) {
    const guid = reader.uint64LE();
    const entry = reader.uint32LE();
    const type = reader.uint32LE();
    const stationery = reader.uint32LE();
    const senderDelay = reader.floatLE();
    senders.push({ delay: senderDelay, entry, guid, stationery, type });
  }
  return {
    count,
    delay,
    senders,
    unread: delay > -86_400 || senders.length > 0,
  };
}

export function parseShowMailbox(reader: PacketReader): bigint {
  return reader.uint64LE();
}

export function parseReceivedMail(reader: PacketReader): void {
  reader.uint32LE();
}

export function buildGetMailList(mailbox: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(mailbox);
  return w.finish();
}

export function buildMailMarkAsRead(mailbox: bigint, id: number): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(mailbox);
  w.uint32LE(id);
  return w.finish();
}

export function buildQueryNextMailTime(): Uint8Array {
  return new Uint8Array();
}
