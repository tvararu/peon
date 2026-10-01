import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export const MAX_MAIL_SENDER_ROWS = 2;
export const MAX_MAIL_ENCHANTS = 7;

export const MAIL_READ_FLAG = 0x01;
export const MAIL_RETURNED_FLAG = 0x02;
export const MAIL_COPIED_FLAG = 0x04;
export const MAIL_COD_PAYMENT_FLAG = 0x08;
export const MAIL_HAS_BODY_FLAG = 0x10;
export const MAX_MAIL_ITEMS = 12;

export const MAIL_RESULT_ACTIONS = {
  send: 0,
  money_taken: 1,
  item_taken: 2,
  returned_to_sender: 3,
  deleted: 4,
  made_permanent: 5,
} as const;

export const MAIL_RESULT_ERRORS = {
  ok: 0,
  equip_error: 1,
  cannot_send_to_self: 2,
  not_enough_money: 3,
  recipient_not_found: 4,
  not_your_team: 5,
  internal_error: 6,
  disabled_for_trial_acc: 14,
  recipient_cap_reached: 15,
  cant_send_wrapped_cod: 16,
  mail_and_chat_suspended: 17,
  too_many_attachments: 18,
  mail_attachment_invalid: 19,
  item_has_expired: 21,
} as const;

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

export type MailResultAction =
  (typeof MAIL_RESULT_ACTIONS)[keyof typeof MAIL_RESULT_ACTIONS];
export type MailResultStatus =
  (typeof MAIL_RESULT_ERRORS)[keyof typeof MAIL_RESULT_ERRORS];

export type MailResultActionName = keyof typeof MAIL_RESULT_ACTIONS;
export type MailResultStatusName = keyof typeof MAIL_RESULT_ERRORS;

export type SendMailResult =
  | {
      readonly id: number;
      readonly action: MailResultActionName;
      readonly status: MailResultStatusName;
    }
  | {
      readonly id: number;
      readonly action: "item_taken";
      readonly status: "ok";
      readonly itemLow: number;
      readonly count: number;
    }
  | {
      readonly id: number;
      readonly action: MailResultActionName;
      readonly status: "equip_error";
      readonly equipError: number;
    };

export type MailDraftItem = {
  readonly slot: number;
  readonly guid: bigint;
};

export type MailDraft = {
  readonly mailbox: bigint;
  readonly receiver: string;
  readonly subject: string;
  readonly body: string;
  readonly stationery?: number;
  readonly items?: readonly MailDraftItem[];
  readonly money?: number;
  readonly cod?: number;
};

function actionName(raw: number): MailResultActionName {
  for (const [name, value] of Object.entries(MAIL_RESULT_ACTIONS))
    if (value === raw) return name as MailResultActionName;
  return "send";
}

function statusName(raw: number): MailResultStatusName {
  for (const [name, value] of Object.entries(MAIL_RESULT_ERRORS))
    if (value === raw) return name as MailResultStatusName;
  return "internal_error";
}

export function parseSendMailResult(reader: PacketReader): SendMailResult {
  const id = reader.uint32LE();
  const action = actionName(reader.uint32LE());
  const status = statusName(reader.uint32LE());
  if (status === "equip_error")
    return { action, equipError: reader.uint32LE(), id, status };
  if (status === "ok" && action === "item_taken") {
    const itemLow = reader.uint32LE();
    const count = reader.uint32LE();
    return { action, count, id, itemLow, status };
  }
  return { action, id, status };
}

export function buildMailTakeMoney(mailbox: bigint, id: number): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(mailbox);
  w.uint32LE(id);
  return w.finish();
}

export function buildMailTakeItem(
  mailbox: bigint,
  id: number,
  itemLow: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(mailbox);
  w.uint32LE(id);
  w.uint32LE(itemLow);
  return w.finish();
}

export function buildMailReturnToSender(
  mailbox: bigint,
  id: number,
  sender: bigint,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(mailbox);
  w.uint32LE(id);
  w.uint64LE(sender);
  return w.finish();
}

export function buildMailDelete(
  mailbox: bigint,
  id: number,
  templateId: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(mailbox);
  w.uint32LE(id);
  w.uint32LE(templateId);
  return w.finish();
}

export function buildMailCreateTextItem(
  mailbox: bigint,
  id: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(mailbox);
  w.uint32LE(id);
  return w.finish();
}

export function buildSendMail(draft: MailDraft): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(draft.mailbox);
  w.cString(draft.receiver);
  w.cString(draft.subject);
  w.cString(draft.body);
  w.uint32LE(draft.stationery ?? 41);
  w.uint32LE(0);
  const items = draft.items ?? [];
  w.uint8(items.length);
  for (const item of items) {
    w.uint8(item.slot);
    w.uint64LE(item.guid);
  }
  w.uint32LE(draft.money ?? 0);
  w.uint32LE(draft.cod ?? 0);
  w.uint64LE(0n);
  w.uint8(0);
  return w.finish();
}
