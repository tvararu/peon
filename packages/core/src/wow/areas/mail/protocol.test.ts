import { describe, expect, test } from "bun:test";
import {
  MAIL_SENDER,
  mailEntryBody,
  mailEntryRawBytes,
  mailListResultBody,
  mailNextMailTimeBody,
  mailRawList,
  mailReceivedMailBody,
  mailShowMailboxBody,
  mailSized,
} from "#test-support/areas/mail";
import {
  buildGetMailList,
  buildMailMarkAsRead,
  buildQueryNextMailTime,
  MAX_MAIL_SENDER_ROWS,
  parseMailList,
  parseNextMailTime,
  parseShowMailbox,
} from "#wow/areas/mail/protocol";
import { PacketReader } from "#wow/protocol/packet";

const PLAYER_MAIL = {
  body: "Meet me at the inn.",
  daysLeft: 29.5,
  flags: 0x01,
  id: 101,
  money: 250,
  subject: "Meet at the inn",
  type: 0,
};

describe("parseMailList", () => {
  test("reads a player letter, a creature mail and a two-item mail with the AzerothCore stack count and enchant order", () => {
    const body = mailListResultBody({
      mails: [
        PLAYER_MAIL,
        {
          daysLeft: 3,
          flags: 0,
          id: 102,
          senderEntry: 611,
          subject: "A creature's note",
          type: 3,
        },
        {
          body: "The requested goods.",
          id: 103,
          items: [
            { count: 5, entry: 159, index: 0, low: 77 },
            { count: 2, entry: 4541, index: 1, low: 78 },
          ],
          subject: "Two items",
        },
      ],
    });
    const list = parseMailList(new PacketReader(body));
    expect(list.realCount).toBe(3);
    expect(list.hidden).toBe(0);
    expect(list.unreadable).toBe(0);
    const letter = list.mails[0];
    expect(letter?.id).toBe(101);
    expect(letter?.sender).toEqual({ guid: MAIL_SENDER, kind: "player" });
    expect(letter?.money).toBe(250);
    expect(letter?.flags).toMatchObject({ raw: 0x01, read: true });
    expect(list.mails[1]?.sender).toEqual({ entry: 611, kind: "entry" });
    expect(list.mails[2]?.items).toEqual([
      {
        charges: 0,
        count: 5,
        durability: 0,
        enchants: [0, 0, 0, 0, 0, 0, 0],
        entry: 159,
        guidLow: 77,
        index: 0,
        maxDurability: 0,
        randomProperty: 0,
        suffixFactor: 0,
      },
      {
        charges: 0,
        count: 2,
        durability: 0,
        enchants: [0, 0, 0, 0, 0, 0, 0],
        entry: 4541,
        guidLow: 78,
        index: 1,
        maxDurability: 0,
        randomProperty: 0,
        suffixFactor: 0,
      },
    ]);
  });

  test("computes the hidden count from the server real count", () => {
    const body = mailListResultBody({
      mails: [{ id: 201, subject: "Kept" }],
      realCount: 5,
    });
    const list = parseMailList(new PacketReader(body));
    expect(list.realCount).toBe(5);
    expect(list.mails.map((mail) => mail.id)).toEqual([201]);
    expect(list.unreadable).toBe(0);
    expect(list.hidden).toBe(4);
  });

  test("stops at an entry whose size overruns the packet", () => {
    const first = mailEntryBody({ id: 301 });
    const broken = mailSized(mailEntryRawBytes({ id: 302 }).slice(0, 3));
    const rest = new Uint8Array([...first, ...broken]);
    const list = parseMailList(new PacketReader(mailRawList(4, rest, 2)));
    expect(list.mails.map((mail) => mail.id)).toEqual([301]);
    expect(list.unreadable).toBe(1);
    expect(list.hidden).toBe(2);
  });
  test("skips a corrupt entry and reads the letters after it", () => {
    const first = mailEntryBody({ id: 301 });
    const corrupt = mailSized(new Uint8Array([0x01]));
    const last = mailEntryBody({ id: 303, subject: "After the break" });
    const rest = new Uint8Array([...first, ...corrupt, ...last]);
    const list = parseMailList(new PacketReader(mailRawList(3, rest, 3)));
    expect(list.mails.map((mail) => mail.id)).toEqual([301, 303]);
    expect(list.unreadable).toBe(1);
    expect(list.hidden).toBe(0);
  });
});

describe("parseNextMailTime", () => {
  test("reads up to two senders with the AzerothCore reply order", () => {
    const senders = parseNextMailTime(
      new PacketReader(
        mailNextMailTimeBody({
          senders: [
            { delay: 120, stationery: 41 },
            { delay: 3600, entry: 611, stationery: 61, type: 3 },
            { delay: 7200 },
          ],
        }),
      ),
    );
    expect(senders.delay).toBe(0);
    expect(senders.count).toBe(2);
    expect(senders.senders).toHaveLength(MAX_MAIL_SENDER_ROWS);
    expect(senders.senders[1]).toMatchObject({ entry: 611, type: 3 });
    expect(senders.unread).toBe(true);
  });

  test("reads the no-unread sentinel as not waiting", () => {
    const senders = parseNextMailTime(new PacketReader(mailNextMailTimeBody()));
    expect(senders.count).toBe(0);
    expect(senders.senders).toEqual([]);
    expect(senders.unread).toBe(false);
  });
});

describe("parseShowMailbox", () => {
  test("reads the mailbox guid", () => {
    const guid = 0xf1_10_00_00_00_00_00_01n;
    expect(parseShowMailbox(new PacketReader(mailShowMailboxBody(guid)))).toBe(
      guid,
    );
  });
});

describe("parseReceivedMail", () => {
  test("reads the zero-body notice", () => {
    const reader = new PacketReader(mailReceivedMailBody());
    expect(reader.uint32LE()).toBe(0);
    expect(reader.remaining).toBe(0);
  });
});

describe("build mail requests", () => {
  test("buildGetMailList and buildMailMarkAsRead write guid then id", () => {
    const mailbox = 0xf1_10_00_00_00_00_00_01n;
    const list = new PacketReader(buildGetMailList(mailbox));
    expect(list.uint64LE()).toBe(mailbox);
    expect(list.remaining).toBe(0);
    const marked = new PacketReader(buildMailMarkAsRead(mailbox, 101));
    expect(marked.uint64LE()).toBe(mailbox);
    expect(marked.uint32LE()).toBe(101);
    expect(marked.remaining).toBe(0);
  });

  test("buildQueryNextMailTime writes an empty body", () => {
    expect(buildQueryNextMailTime()).toEqual(new Uint8Array());
  });
});
