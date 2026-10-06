import { describe, expect, test } from "bun:test";
import { truncateNote } from "#wow/areas/contacts/protocol";
import { ContactStore, type ContactsEvent } from "#wow/areas/contacts/store";

const GUID = 0x99n;

function seen(store: ContactStore): ContactsEvent[] {
  const events: ContactsEvent[] = [];
  store.onEvent((e) => events.push(e));
  return events;
}

describe("ContactStore", () => {
  test("starts empty", () => {
    expect(new ContactStore().snapshot()).toEqual({
      lastMask: undefined,
      notes: [],
      reported: [],
    });
  });

  test("receiveContactList records the mask and the notes", () => {
    const store = new ContactStore();
    const events = seen(store);
    store.receiveContactList({
      contacts: [
        { flags: 0x01, guid: GUID, note: "peon" },
        { flags: 0x02, guid: 0xddn, note: "" },
      ],
      listMask: 1,
    });
    expect(store.snapshot()).toMatchObject({
      lastMask: 1,
      notes: [{ guid: GUID, note: "peon" }],
    });
    expect(events).toEqual([{ type: "contact_list", listMask: 1 }]);
  });

  test("truncateNote cuts at 48 UTF-8 bytes without splitting a character", () => {
    expect(truncateNote("a".repeat(48))).toBe("a".repeat(48));
    expect(truncateNote("a".repeat(60))).toBe("a".repeat(48));
    expect(truncateNote(`${"a".repeat(47)}é`)).toBe("a".repeat(47));
    expect(truncateNote("é".repeat(30))).toBe("é".repeat(23));
  });

  test("setNote stores the truncated note and emits note_set", () => {
    const store = new ContactStore();
    const events = seen(store);
    store.setNote(GUID, "x".repeat(60));
    expect(store.noteOf(GUID)).toBe("x".repeat(48));
    expect(events).toEqual([
      { type: "note_set", guid: GUID, note: "x".repeat(48) },
    ]);
  });

  test("markReported answers true once per guid", () => {
    const store = new ContactStore();
    expect(store.markReported(GUID)).toBe(true);
    expect(store.markReported(GUID)).toBe(false);
    expect(store.snapshot().reported).toEqual([GUID]);
  });
});
