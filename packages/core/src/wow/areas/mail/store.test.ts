import { describe, expect, test } from "bun:test";
import {
  MAIL_SENDER,
  MAILBOX_OBJECT,
  mailListResultBody,
  mailNextMailTimeBody,
  mailReceivedMailBody,
  mailRig,
  mailShowMailboxBody,
} from "#test-support/areas/mail";
import { GameOpcode } from "#wow/protocol/opcodes";

const OTHER = 0x00_00_00_00_00_00_00_99n;

describe("mail store", () => {
  test("a list sets the inbox, the hidden count and emits listed", () => {
    const rig = mailRig();
    const seen: string[] = [];
    rig.handle.onEvent((event) => seen.push(event.type));
    try {
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({
          mails: [
            {
              body: "Meet me at the inn.",
              cod: 0,
              flags: 0,
              id: 101,
              money: 250,
              subject: "Meet at the inn",
            },
            {
              flags: 0,
              id: 102,
              items: [{ count: 5, entry: 159, low: 77 }],
              senderEntry: 611,
              subject: "A creature's note",
              type: 3,
            },
          ],
          realCount: 4,
        }),
      );
      const state = rig.handle.state();
      expect(state.mailbox).toBeUndefined();
      expect(state.inbox.map((mail) => mail.id)).toEqual([101, 102]);
      const letter = state.inbox[0];
      expect(letter?.sender).toEqual({ guid: MAIL_SENDER, kind: "player" });
      expect(letter?.subject).toBe("Meet at the inn");
      expect(letter?.body).toBe("Meet me at the inn.");
      expect(letter?.money).toBe(250);
      expect(letter?.flags).toMatchObject({ raw: 0, read: false });
      expect(state.inbox[1]?.items[0]).toMatchObject({
        count: 5,
        entry: 159,
        guidLow: 77,
      });
      expect(state.hidden).toBe(2);
      expect(seen).toEqual(["listed"]);
    } finally {
      rig.dispose();
    }
  });

  test("a next-mail-time packet sets the unread senders", () => {
    const rig = mailRig();
    const seen: string[] = [];
    rig.handle.onEvent((event) => seen.push(event.type));
    try {
      rig.inject(
        GameOpcode.MSG_QUERY_NEXT_MAIL_TIME,
        mailNextMailTimeBody({ senders: [{ delay: 120 }] }),
      );
      const state = rig.handle.state();
      expect(state.unread).toBe(true);
      expect(state.senders).toHaveLength(1);
      expect(state.senders[0]).toMatchObject({ delay: 120, type: 0 });
      expect(seen).toEqual(["next_time"]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_RECEIVED_MAIL sets the notice and a list clears it", () => {
    const rig = mailRig();
    const seen: string[] = [];
    rig.handle.onEvent((event) => seen.push(event.type));
    try {
      rig.inject(GameOpcode.SMSG_RECEIVED_MAIL, mailReceivedMailBody());
      expect(rig.handle.state().newMail).toBe(true);
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({ mails: [{ id: 1 }] }),
      );
      expect(rig.handle.state().newMail).toBe(false);
      expect(seen).toEqual(["new_mail", "listed"]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SHOW_MAILBOX sets the mailbox and emits mailbox_shown", () => {
    const rig = mailRig();
    const seen: string[] = [];
    rig.handle.onEvent((event) => seen.push(event.type));
    try {
      rig.inject(
        GameOpcode.SMSG_SHOW_MAILBOX,
        mailShowMailboxBody(MAILBOX_OBJECT),
      );
      expect(rig.handle.state().mailbox).toBe(MAILBOX_OBJECT);
      expect(seen).toEqual(["mailbox_shown"]);
      rig.inject(GameOpcode.SMSG_SHOW_MAILBOX, mailShowMailboxBody(OTHER));
      expect(rig.handle.state().mailbox).toBe(OTHER);
    } finally {
      rig.dispose();
    }
  });
});
