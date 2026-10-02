import { Emitter, type Unsubscribe } from "#lib/emitter";
import { truncateNote } from "#wow/areas/contacts/protocol";
import type { ContactList } from "#wow/protocol/social";

export type ContactsState = {
  notes: readonly { guid: bigint; note: string }[];
  reported: readonly bigint[];
  lastMask: number | undefined;
};

export type ContactsEvent =
  | { type: "contact_list"; listMask: number }
  | { type: "note_set"; guid: bigint; note: string }
  | { type: "ignored_whisper"; guid: bigint };

export class ContactStore {
  private readonly events = new Emitter<[ContactsEvent]>();
  private readonly notes = new Map<bigint, string>();
  private readonly reported = new Set<bigint>();
  private lastMask: number | undefined;

  snapshot(): ContactsState {
    return {
      lastMask: this.lastMask,
      notes: [...this.notes].map(([guid, note]) => ({ guid, note })),
      reported: [...this.reported],
    };
  }

  onEvent(cb: (event: ContactsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveContactList(list: ContactList): void {
    this.lastMask = list.listMask;
    for (const entry of list.contacts)
      if (entry.note !== "") this.notes.set(entry.guid, entry.note);
    this.events.emit({ type: "contact_list", listMask: list.listMask });
  }

  setNote(guid: bigint, note: string): void {
    const truncated = truncateNote(note);
    this.notes.set(guid, truncated);
    this.events.emit({ type: "note_set", guid, note: truncated });
  }

  noteOf(guid: bigint): string | undefined {
    return this.notes.get(guid);
  }

  ignoredWhisper(guid: bigint): void {
    this.events.emit({ type: "ignored_whisper", guid });
  }

  markReported(guid: bigint): boolean {
    if (this.reported.has(guid)) return false;
    this.reported.add(guid);
    return true;
  }

  dispose(): void {
    this.events.clear();
  }
}
