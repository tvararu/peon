import { areaRig } from "#test-support/area-rig";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { PacketWriter } from "#wow/protocol/packet";

export const MAIL_SELF = 0x00_00_00_00_00_00_00_07n;
export const MAIL_SENDER = 0x00_00_00_00_00_00_00_2an;
export const MAILBOX_OBJECT = 0xf1_10_00_00_00_00_00_01n;

export type MailItemInit = {
  index?: number;
  low?: number;
  entry?: number;
  count?: number;
  charges?: number;
  maxDurability?: number;
  durability?: number;
};

export type MailEntryInit = {
  id?: number;
  type?: number;
  senderGuid?: bigint;
  senderEntry?: number;
  cod?: number;
  stationery?: number;
  money?: number;
  flags?: number;
  daysLeft?: number;
  template?: number;
  subject?: string;
  body?: string;
  items?: readonly MailItemInit[];
};

function writeMailItem(w: PacketWriter, item: MailItemInit): void {
  w.uint8(item.index ?? 0);
  w.uint32LE(item.low ?? 0);
  w.uint32LE(item.entry ?? 0);
  for (let j = 0; j < 7; j++) {
    w.uint32LE(0);
    w.uint32LE(0);
    w.uint32LE(0);
  }
  w.uint32LE(0);
  w.uint32LE(0);
  w.uint32LE(item.count ?? 0);
  w.uint32LE(item.charges ?? 0);
  w.uint32LE(item.maxDurability ?? 0);
  w.uint32LE(item.durability ?? 0);
  w.uint8(0);
}

export const MAIL_ITEM_BYTES =
  1 + 4 + 4 + 7 * 3 * 4 + 4 + 4 + 4 + 4 + 4 + 4 + 1;

export function writeMailEntry(w: PacketWriter, mail: MailEntryInit): void {
  if (
    mail.type !== undefined &&
    mail.type !== 0 &&
    mail.senderGuid !== undefined
  )
    throw new Error("mail entry needs senderEntry for a non-player type.");
  const body = new PacketWriter();
  body.uint32LE(mail.id ?? 0);
  body.uint8(mail.type ?? 0);
  if ((mail.type ?? 0) === 0) body.uint64LE(mail.senderGuid ?? MAIL_SENDER);
  else body.uint32LE(mail.senderEntry ?? 0);
  body.uint32LE(mail.cod ?? 0);
  body.uint32LE(0);
  body.uint32LE(mail.stationery ?? 41);
  body.uint32LE(mail.money ?? 0);
  body.uint32LE(mail.flags ?? 0);
  body.floatLE(mail.daysLeft ?? 30);
  body.uint32LE(mail.template ?? 0);
  body.cString(mail.subject ?? "");
  body.cString(mail.body ?? "");
  const items = mail.items ?? [];
  body.uint8(items.length);
  for (const item of items) writeMailItem(body, item);
  const raw = body.finish();
  const size = 2 + raw.byteLength;
  w.uint16LE(size);
  w.rawBytes(raw);
}

type MailListInit = {
  realCount?: number;
  mails?: readonly MailEntryInit[];
};

export function mailListResultBody(init: MailListInit = {}): Uint8Array {
  const mails = init.mails ?? [{ id: 1 }];
  const w = new PacketWriter();
  w.uint32LE(init.realCount ?? mails.length);
  w.uint8(mails.length);
  for (const mail of mails) writeMailEntry(w, mail);
  return w.finish();
}

export function mailRawList(
  count: number,
  raw: Uint8Array,
  shown = 3,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(count);
  w.uint8(shown);
  w.rawBytes(raw);
  return w.finish();
}

export function mailSized(raw: Uint8Array): Uint8Array {
  const w = new PacketWriter();
  w.uint16LE(2 + raw.byteLength);
  w.rawBytes(raw);
  return w.finish();
}

export function mailEntryBody(mail: MailEntryInit = {}): Uint8Array {
  const w = new PacketWriter();
  writeMailEntry(w, mail);
  return w.finish();
}

export function mailEntryRawBytes(mail: MailEntryInit = {}): Uint8Array {
  return mailEntryBody(mail).slice(2);
}

export function mailBadCountBody(): Uint8Array {
  const w = new PacketWriter();
  w.uint16LE(2 + 4 + 1);
  w.uint32LE(7);
  w.uint8(3);
  return w.finish();
}

export function mailItemSize(): number {
  return MAIL_ITEM_BYTES;
}

export type NextMailSenderInit = {
  guid?: bigint;
  entry?: number;
  type?: number;
  stationery?: number;
  delay?: number;
};

export function mailNextMailTimeBody(
  init: { senders?: readonly NextMailSenderInit[] } = {},
): Uint8Array {
  const w = new PacketWriter();
  const senders = init.senders ?? [];
  if (senders.length === 0) {
    w.floatLE(-86_400);
    w.uint32LE(0);
    return w.finish();
  }
  w.floatLE(0);
  w.uint32LE(senders.length > 2 ? 2 : senders.length);
  for (const sender of senders.slice(0, 2)) {
    w.uint64LE(sender.guid ?? MAIL_SENDER);
    w.uint32LE(sender.entry ?? 0);
    w.uint32LE(sender.type ?? 0);
    w.uint32LE(sender.stationery ?? 41);
    w.floatLE(sender.delay ?? 3600);
  }
  return w.finish();
}

export function mailShowMailboxBody(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}

export function mailReceivedMailBody(): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(0);
  return w.finish();
}

export function mailPlayer(position: {
  mapId: number;
  x: number;
  y: number;
  z: number;
  orientation: number;
}): Entity {
  return {
    entry: 0,
    guid: MAIL_SELF,
    name: undefined,
    objectType: ObjectType.PLAYER,
    position,
    rawFields: new Map(),
    scale: 1,
  } as Entity;
}

export function mailMailbox(position: {
  mapId: number;
  x: number;
  y: number;
  z: number;
  orientation: number;
}): Entity {
  return {
    bytes1: 0,
    displayId: 0,
    entry: 32_349,
    flags: 0,
    gameObjectType: 19,
    guid: MAILBOX_OBJECT,
    name: undefined,
    objectType: ObjectType.GAMEOBJECT,
    position,
    rawFields: new Map(),
    scale: 1,
  } as Entity;
}

export function mailRig() {
  const self = mailPlayer({ mapId: 0, orientation: 0, x: 0, y: 0, z: 0 });
  const box = mailMailbox({ mapId: 0, orientation: 0, x: 5, y: 0, z: 0 });
  return areaRig("mail", {
    getEntity: (guid) => {
      if (guid === MAIL_SELF) return self;
      if (guid === MAILBOX_OBJECT) return box;
    },
    selfGuid: MAIL_SELF,
  });
}
