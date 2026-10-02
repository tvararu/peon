import { PacketWriter } from "#wow/protocol/packet";

export type ContactsContactEntry = {
  guid: bigint;
  flags: number;
  note: string;
  status?: number;
  area?: number;
  level?: number;
  playerClass?: number;
};

export function contactsContactListBody(init: {
  listMask: number;
  entries: ContactsContactEntry[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.listMask);
  w.uint32LE(init.entries.length);
  for (const e of init.entries) {
    w.uint64LE(e.guid);
    w.uint32LE(e.flags);
    w.cString(e.note);
    if (e.flags & 0x01) {
      const status = e.status ?? 0;
      w.uint8(status);
      if (status !== 0) {
        w.uint32LE(e.area ?? 0);
        w.uint32LE(e.level ?? 0);
        w.uint32LE(e.playerClass ?? 0);
      }
    }
  }
  return w.finish();
}
