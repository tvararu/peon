import { describe, expect, test } from "bun:test";
import { contactsContactListBody } from "#test-support/areas/contacts";
import { FriendStore } from "#wow/friend-store";
import { IgnoreStore } from "#wow/ignore-store";
import { PacketReader } from "#wow/protocol/packet";
import type { WorldConn } from "#wow/world-conn";
import { createWorldEvents } from "#wow/world-events";
import { handleContactList } from "#wow/world-handlers-social";

const FRIEND = 0x99n;
const IGNORED = 0xddn;

function conn(): WorldConn {
  return {
    events: createWorldEvents(),
    friendStore: new FriendStore(),
    ignoreStore: new IgnoreStore(),
    nameCache: new Map([
      [Number(FRIEND & 0xffffffffn), "Arthas"],
      [Number(IGNORED & 0xffffffffn), "Hogger"],
      [0xee, "HoggerTwo"],
      [0xff, "Mute"],
    ]),
    pendingNameQueries: new Set<string>(),
  } as unknown as WorldConn;
}

function seed(c: WorldConn): void {
  handleContactList(
    c,
    new PacketReader(
      contactsContactListBody({
        entries: [
          {
            area: 10,
            flags: 0x01,
            guid: FRIEND,
            level: 80,
            note: "tank",
            playerClass: 1,
            status: 1,
          },
          { flags: 0x02, guid: IGNORED, note: "" },
        ],
        listMask: 7,
      }),
    ),
  );
}

describe("contact list masks", () => {
  test("a friends-only reply replaces friends and keeps the ignore list", () => {
    const c = conn();
    seed(c);
    handleContactList(
      c,
      new PacketReader(
        contactsContactListBody({
          entries: [
            {
              area: 12,
              flags: 0x01,
              guid: FRIEND,
              level: 81,
              note: "peon",
              playerClass: 1,
              status: 1,
            },
          ],
          listMask: 1,
        }),
      ),
    );
    expect(c.friendStore.all().map((e) => e.note)).toEqual(["peon"]);
    expect(c.ignoreStore.all().map((e) => e.guid)).toEqual([IGNORED]);
  });

  test("an ignore-only reply replaces ignored and keeps friends", () => {
    const c = conn();
    seed(c);
    handleContactList(
      c,
      new PacketReader(
        contactsContactListBody({
          entries: [{ flags: 0x02, guid: 0xeen, note: "" }],
          listMask: 2,
        }),
      ),
    );
    expect(c.ignoreStore.all().map((e) => e.guid)).toEqual([0xeen]);
    expect(c.friendStore.all().map((e) => e.guid)).toEqual([FRIEND]);
  });

  test("a mute-only reply touches neither list", () => {
    const c = conn();
    seed(c);
    handleContactList(
      c,
      new PacketReader(
        contactsContactListBody({
          entries: [{ flags: 0x04, guid: 0xffn, note: "" }],
          listMask: 4,
        }),
      ),
    );
    expect(c.friendStore.all().map((e) => e.guid)).toEqual([FRIEND]);
    expect(c.ignoreStore.all().map((e) => e.guid)).toEqual([IGNORED]);
  });
});
