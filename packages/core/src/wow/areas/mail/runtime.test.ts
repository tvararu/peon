import { describe, expect, test } from "bun:test";
import {
  MAIL_SENDER,
  MAILBOX_OBJECT,
  mailListResultBody,
  mailMailbox,
  mailNextMailTimeBody,
  mailRig,
  mailSendMailResultBody,
} from "#test-support/areas/mail";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import {
  buildGetMailList,
  buildMailCreateTextItem,
  buildMailMarkAsRead,
  buildMailReturnToSender,
  buildMailTakeItem,
  buildMailTakeMoney,
} from "#wow/areas/mail/protocol";
import { MAIL_ANSWER_MS } from "#wow/areas/mail/runtime";
import { mailboxKind } from "#wow/areas/mail/store";
import type { Entity } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";

function breakMailSend(rig: { sent: readonly unknown[] }): () => void {
  const sent = rig.sent as unknown as {
    push: (...items: never[]) => number;
  };
  const original = sent.push;
  sent.push = () => {
    throw new Error("world socket is not connected");
  };
  return () => {
    sent.push = original;
  };
}

const FAR = 0xf1_10_00_00_00_00_00_09n;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("mailboxKind packed type fallback", () => {
  const recreated = (gameObjectType: number, bytes1: number) =>
    ({
      ...mailMailbox({ mapId: 0, orientation: 0, x: 5, y: 0, z: 0 }),
      bytes1,
      gameObjectType,
    }) as Entity;

  test("a recreated mailbox with no query type is recognised from bytes1", () => {
    expect(mailboxKind(recreated(0, 19 << 8))).toBe("object");
  });

  test("a packed type other than mailbox is rejected", () => {
    expect(mailboxKind(recreated(0, 5 << 8))).toBeUndefined();
    expect(mailboxKind(recreated(0, 0))).toBeUndefined();
  });

  test("the query type still wins when bytes1 is empty", () => {
    expect(mailboxKind(recreated(19, 0))).toBe("object");
  });
});

describe("mail acts", () => {
  test("listMail throws no_mailbox for an unknown or distant box", async () => {
    const rig = mailRig();
    try {
      await expect(rig.handle.act.listMail(FAR)).rejects.toThrow("no_mailbox");
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("listMail sends CMSG_GET_MAIL_LIST and settles ok on listed", async () => {
    const rig = mailRig();
    try {
      const pending = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      expect(rig.sent).toEqual([
        {
          body: buildGetMailList(MAILBOX_OBJECT),
          opcode: GameOpcode.CMSG_GET_MAIL_LIST,
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({
          mails: [{ id: 101, subject: "Meet at the inn" }],
        }),
      );
      expect(await pending).toEqual({ status: "ok" });
      expect(rig.handle.state().mailbox).toBe(MAILBOX_OBJECT);
      expect(rig.handle.state().inbox.map((mail) => mail.id)).toEqual([101]);
    } finally {
      rig.dispose();
    }
  });

  test("listMail settles unanswered after 5 s of silence", async () => {
    await withFakeTimers(async () => {
      const rig = mailRig();
      try {
        const pending = rig.handle.act.listMail(MAILBOX_OBJECT);
        await elapse(5000);
        expect(await pending).toEqual({ status: "unanswered" });
        expect(rig.handle.state().mailbox).toBeUndefined();
      } finally {
        rig.dispose();
      }
    });
  });

  test("markMailRead sends CMSG_MAIL_MARK_AS_READ and settles ok with no reply", async () => {
    const rig = mailRig();
    try {
      const pending = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({ mails: [{ id: 101 }] }),
      );
      expect(await pending).toEqual({ status: "ok" });
      expect(await rig.handle.act.markMailRead(101)).toEqual({ status: "ok" });
      expect(rig.sent.at(-1)).toEqual({
        body: buildMailMarkAsRead(MAILBOX_OBJECT, 101),
        opcode: GameOpcode.CMSG_MAIL_MARK_AS_READ,
      });
    } finally {
      rig.dispose();
    }
  });

  test("markMailRead throws no_mailbox before any list", async () => {
    const rig = mailRig();
    try {
      await expect(rig.handle.act.markMailRead(101)).rejects.toThrow(
        "no_mailbox",
      );
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("queryNextMail sends MSG_QUERY_NEXT_MAIL_TIME and settles on next_time", async () => {
    const rig = mailRig();
    try {
      const pending = rig.handle.act.queryNextMail();
      await flush();
      expect(rig.sent).toEqual([
        { body: new Uint8Array(), opcode: GameOpcode.MSG_QUERY_NEXT_MAIL_TIME },
      ]);
      rig.inject(
        GameOpcode.MSG_QUERY_NEXT_MAIL_TIME,
        mailNextMailTimeBody({ senders: [{}] }),
      );
      expect(await pending).toEqual({ status: "ok", unread: true });
      expect(rig.handle.state().senders[0]).toMatchObject({
        delay: 0,
        entry: 0,
        guid: MAIL_SENDER,
      });
    } finally {
      rig.dispose();
    }
  });

  test("queryNextMail settles unanswered after 5 s of silence", async () => {
    await withFakeTimers(async () => {
      const rig = mailRig();
      try {
        const pending = rig.handle.act.queryNextMail();
        await elapse(5000);
        expect(await pending).toEqual({ status: "unanswered" });
      } finally {
        rig.dispose();
      }
    });
  });

  test("run abort rejects a pending list", async () => {
    const rig = mailRig();
    const pending = rig.handle.act.listMail(MAILBOX_OBJECT);
    await flush();
    rig.dispose();
    await expect(pending).rejects.toThrow();
  });

  test("listMail rethrows a send failure and leaks no rejection", async () => {
    await withFakeTimers(async () => {
      const unhandled: unknown[] = [];
      const listener = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", listener);
      const rig = mailRig();
      const restore = breakMailSend(rig);
      try {
        const failed = rig.handle.act.listMail(MAILBOX_OBJECT);
        await expect(failed).rejects.toThrow("world socket is not connected");
        await elapse(MAIL_ANSWER_MS + 100);
        await Promise.resolve();
        expect(unhandled).toEqual([]);
      } finally {
        restore();
        process.off("unhandledRejection", listener);
        rig.dispose();
      }
    });
  });

  test("queryNextMail rethrows a send failure and leaks no rejection", async () => {
    await withFakeTimers(async () => {
      const unhandled: unknown[] = [];
      const listener = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", listener);
      const rig = mailRig();
      const restore = breakMailSend(rig);
      try {
        const failed = rig.handle.act.queryNextMail();
        await expect(failed).rejects.toThrow("world socket is not connected");
        await elapse(MAIL_ANSWER_MS + 100);
        await Promise.resolve();
        expect(unhandled).toEqual([]);
      } finally {
        restore();
        process.off("unhandledRejection", listener);
        rig.dispose();
      }
    });
  });
});

describe("mail actions", () => {
  test("takeMailMoney settles ok on the money result and clears the money", async () => {
    const rig = mailRig();
    try {
      const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({ mails: [{ id: 101, money: 250 }] }),
      );
      expect(await listed).toEqual({ status: "ok" });
      const pending = rig.handle.act.takeMailMoney(101);
      await flush();
      expect(rig.sent.at(-1)).toEqual({
        body: buildMailTakeMoney(MAILBOX_OBJECT, 101),
        opcode: GameOpcode.CMSG_MAIL_TAKE_MONEY,
      });
      rig.inject(
        GameOpcode.SMSG_SEND_MAIL_RESULT,
        mailSendMailResultBody({ action: 1, id: 101 }),
      );
      expect(await pending).toEqual({ status: "ok" });
      expect(rig.handle.state().inbox[0]?.money).toBe(0);
    } finally {
      rig.dispose();
    }
  });

  test("takeMailItem settles ok with the server item tail and drops the item", async () => {
    const rig = mailRig();
    try {
      const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({
          mails: [{ id: 102, items: [{ count: 5, entry: 159, low: 77 }] }],
        }),
      );
      expect(await listed).toEqual({ status: "ok" });
      const pending = rig.handle.act.takeMailItem(102, 77);
      await flush();
      expect(rig.sent.at(-1)).toEqual({
        body: buildMailTakeItem(MAILBOX_OBJECT, 102, 77),
        opcode: GameOpcode.CMSG_MAIL_TAKE_ITEM,
      });
      rig.inject(
        GameOpcode.SMSG_SEND_MAIL_RESULT,
        mailSendMailResultBody({ action: 2, count: 5, id: 102, itemLow: 77 }),
      );
      expect(await pending).toEqual({ itemLow: 77, status: "ok" });
      expect(rig.handle.state().inbox[0]?.items).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("takeMailItem refuses an unpaid COD mail unless told to pay", async () => {
    const rig = mailRig({ coinage: 1000, name: "Target" });
    try {
      const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({
          mails: [{ cod: 500, id: 102, items: [{ count: 1, low: 77 }] }],
        }),
      );
      expect(await listed).toEqual({ status: "ok" });
      await expect(rig.handle.act.takeMailItem(102, 77)).rejects.toThrow(
        "cod_unpaid",
      );
      expect(rig.sent.at(-1)?.opcode).not.toBe(GameOpcode.CMSG_MAIL_TAKE_ITEM);
      const pending = rig.handle.act.takeMailItem(102, 77, { payCod: true });
      await flush();
      expect(rig.sent.at(-1)).toEqual({
        body: buildMailTakeItem(MAILBOX_OBJECT, 102, 77),
        opcode: GameOpcode.CMSG_MAIL_TAKE_ITEM,
      });
      rig.inject(
        GameOpcode.SMSG_SEND_MAIL_RESULT,
        mailSendMailResultBody({ action: 2, count: 1, id: 102, itemLow: 77 }),
      );
      expect(await pending).toEqual({ itemLow: 77, status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("deleteMail refuses a letter that still holds money or items", async () => {
    const rig = mailRig();
    try {
      const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({ mails: [{ id: 101, money: 250 }] }),
      );
      expect(await listed).toEqual({ status: "ok" });
      await expect(rig.handle.act.deleteMail(101)).rejects.toThrow(
        "mail_not_empty",
      );
      expect(rig.sent.at(-1)?.opcode).not.toBe(GameOpcode.CMSG_MAIL_DELETE);
    } finally {
      rig.dispose();
    }
  });

  test("returnMail writes the sender guid and drops the letter on ok", async () => {
    const rig = mailRig();
    try {
      const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      rig.inject(GameOpcode.SMSG_MAIL_LIST_RESULT, mailListResultBody({}));
      expect(await listed).toEqual({ status: "ok" });
      await expect(rig.handle.act.returnMail(999)).rejects.toThrow(
        "no_such_mail",
      );
      const second = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({ mails: [{ id: 101 }] }),
      );
      expect(await second).toEqual({ status: "ok" });
      const pending = rig.handle.act.returnMail(101);
      await flush();
      expect(rig.sent.at(-1)).toEqual({
        body: buildMailReturnToSender(MAILBOX_OBJECT, 101, MAIL_SENDER),
        opcode: GameOpcode.CMSG_MAIL_RETURN_TO_SENDER,
      });
      rig.inject(
        GameOpcode.SMSG_SEND_MAIL_RESULT,
        mailSendMailResultBody({ action: 3, id: 101 }),
      );
      expect(await pending).toEqual({ status: "ok" });
      expect(rig.handle.state().inbox).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("copyMailText refuses an already copied letter and sends otherwise", async () => {
    const rig = mailRig();
    try {
      const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({ mails: [{ body: "", flags: 0x04, id: 101 }] }),
      );
      expect(await listed).toEqual({ status: "ok" });
      await expect(rig.handle.act.copyMailText(101)).rejects.toThrow(
        "already_copied",
      );
      const second = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({
          mails: [{ body: "Meet me at the inn.", id: 102 }],
        }),
      );
      expect(await second).toEqual({ status: "ok" });
      const pending = rig.handle.act.copyMailText(102);
      await flush();
      expect(rig.sent.at(-1)).toEqual({
        body: buildMailCreateTextItem(MAILBOX_OBJECT, 102),
        opcode: GameOpcode.CMSG_MAIL_CREATE_TEXT_ITEM,
      });
      rig.inject(
        GameOpcode.SMSG_SEND_MAIL_RESULT,
        mailSendMailResultBody({ action: 5, id: 102 }),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("sendMail refuses bad drafts before sending anything", async () => {
    const rig = mailRig({ coinage: 40, name: "Target" });
    try {
      const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      rig.inject(GameOpcode.SMSG_MAIL_LIST_RESULT, mailListResultBody({}));
      expect(await listed).toEqual({ status: "ok" });
      await expect(
        rig.handle.act.sendMail({ body: "", receiver: "", subject: "" }),
      ).rejects.toThrow("no_receiver");
      await expect(
        rig.handle.act.sendMail({ body: "", receiver: "Target", subject: "" }),
      ).rejects.toThrow("cannot_send_to_self");
      await expect(
        rig.handle.act.sendMail({
          body: "",
          cod: 10,
          money: 10,
          receiver: "Friend",
          subject: "",
        }),
      ).rejects.toThrow("cod_with_money");
      await expect(
        rig.handle.act.sendMail({
          body: "",
          money: 100,
          receiver: "Friend",
          subject: "",
        }),
      ).rejects.toThrow("not_enough_money");
      expect(
        rig.sent.filter((row) => row.opcode === GameOpcode.CMSG_SEND_MAIL),
      ).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a server refusal settles refused and releases the next action", async () => {
    const rig = mailRig();
    try {
      const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({ mails: [{ id: 101 }] }),
      );
      expect(await listed).toEqual({ status: "ok" });
      const first = rig.handle.act.deleteMail(101);
      await flush();
      rig.inject(
        GameOpcode.SMSG_SEND_MAIL_RESULT,
        mailSendMailResultBody({ action: 4, id: 101, result: 6 }),
      );
      expect(await first).toEqual({ status: "refused", why: "internal_error" });
      const second = rig.handle.act.deleteMail(101);
      await flush();
      rig.inject(
        GameOpcode.SMSG_SEND_MAIL_RESULT,
        mailSendMailResultBody({ action: 4, id: 101 }),
      );
      expect(await second).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });
});
