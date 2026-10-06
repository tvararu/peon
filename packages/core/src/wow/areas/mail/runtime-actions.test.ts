import { describe, expect, test } from "bun:test";
import {
  MAIL_SENDER,
  MAILBOX_OBJECT,
  mailListResultBody,
  mailRig,
  mailSendMailResultBody,
} from "#test-support/areas/mail";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { flushMicrotasks } from "#test-support/microtasks";
import {
  buildMailCreateTextItem,
  buildMailReturnToSender,
  buildMailTakeItem,
  buildMailTakeMoney,
} from "#wow/areas/mail/protocol";
import { MAIL_ANSWER_MS } from "#wow/areas/mail/runtime";
import { GameOpcode } from "#wow/protocol/opcodes";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
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

  test("takeMailItem clears COD after the first take so the second needs no payment", async () => {
    const rig = mailRig({ coinage: 1000, name: "Target" });
    try {
      const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({
          mails: [
            {
              cod: 500,
              id: 102,
              items: [
                { count: 1, low: 77 },
                { count: 1, low: 78 },
              ],
            },
          ],
        }),
      );
      expect(await listed).toEqual({ status: "ok" });
      const first = rig.handle.act.takeMailItem(102, 77, { payCod: true });
      await flush();
      rig.inject(
        GameOpcode.SMSG_SEND_MAIL_RESULT,
        mailSendMailResultBody({ action: 2, count: 1, id: 102, itemLow: 77 }),
      );
      expect(await first).toEqual({ itemLow: 77, status: "ok" });
      const second = rig.handle.act.takeMailItem(102, 78);
      await flush();
      expect(rig.sent.at(-1)).toEqual({
        body: buildMailTakeItem(MAILBOX_OBJECT, 102, 78),
        opcode: GameOpcode.CMSG_MAIL_TAKE_ITEM,
      });
      rig.inject(
        GameOpcode.SMSG_SEND_MAIL_RESULT,
        mailSendMailResultBody({ action: 2, count: 1, id: 102, itemLow: 78 }),
      );
      expect(await second).toEqual({ itemLow: 78, status: "ok" });
      expect(rig.handle.state().inbox[0]?.items).toEqual([]);
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

  test("a delayed success for a timed-out attachment does not settle the next attachment", async () => {
    await withFakeTimers(async () => {
      const rig = mailRig();
      try {
        const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
        await flushMicrotasks();
        rig.inject(
          GameOpcode.SMSG_MAIL_LIST_RESULT,
          mailListResultBody({
            mails: [
              {
                id: 102,
                items: [
                  { count: 5, entry: 159, low: 77 },
                  { count: 3, entry: 159, low: 78 },
                ],
              },
            ],
          }),
        );
        expect(await listed).toEqual({ status: "ok" });
        const first = rig.handle.act.takeMailItem(102, 77);
        await flushMicrotasks();
        await elapse(MAIL_ANSWER_MS);
        expect(await first).toEqual({ status: "unanswered" });
        expect(rig.handle.state().pending).toEqual({
          action: "item_taken",
          id: 102,
          itemLow: 77,
        });
        await expect(rig.handle.act.takeMailItem(102, 78)).rejects.toThrow(
          "mail_busy",
        );
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 2, count: 5, id: 102, itemLow: 77 }),
        );
        await flushMicrotasks();
        expect(rig.handle.state().pending).toBeUndefined();
        expect(
          rig.handle.state().inbox[0]?.items.map((i) => i.guidLow),
        ).toEqual([78]);
        const second = rig.handle.act.takeMailItem(102, 78);
        await flushMicrotasks();
        let settled = false;
        second.then(() => {
          settled = true;
        });
        await flushMicrotasks();
        expect(settled).toBe(false);
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 2, count: 3, id: 102, itemLow: 78 }),
        );
        expect(await second).toEqual({ itemLow: 78, status: "ok" });
      } finally {
        rig.dispose();
      }
    });
  });

  test("a timed-out delete holds the guard until its own reply drains", async () => {
    await withFakeTimers(async () => {
      const rig = mailRig();
      try {
        const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
        await flushMicrotasks();
        rig.inject(
          GameOpcode.SMSG_MAIL_LIST_RESULT,
          mailListResultBody({
            mails: [{ id: 101 }, { id: 102 }],
          }),
        );
        expect(await listed).toEqual({ status: "ok" });
        const first = rig.handle.act.deleteMail(101);
        await flushMicrotasks();
        await elapse(MAIL_ANSWER_MS);
        expect(await first).toEqual({ status: "unanswered" });
        expect(rig.handle.state().pending).toEqual({
          action: "deleted",
          id: 101,
        });
        await expect(rig.handle.act.deleteMail(102)).rejects.toThrow(
          "mail_busy",
        );
        expect(
          rig.sent.filter((row) => row.opcode === GameOpcode.CMSG_MAIL_DELETE),
        ).toHaveLength(1);
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 4, id: 101 }),
        );
        await flushMicrotasks();
        expect(rig.handle.state().pending).toBeUndefined();
        expect(rig.handle.state().inbox.map((mail) => mail.id)).toEqual([102]);
        const second = rig.handle.act.deleteMail(102);
        await flushMicrotasks();
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 4, id: 102 }),
        );
        expect(await second).toEqual({ status: "ok" });
      } finally {
        rig.dispose();
      }
    });
  });

  test("a delayed take success during a refresh leaves it pending", async () => {
    await withFakeTimers(async () => {
      const rig = mailRig();
      try {
        const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
        await flushMicrotasks();
        rig.inject(
          GameOpcode.SMSG_MAIL_LIST_RESULT,
          mailListResultBody({
            mails: [{ id: 101, money: 250 }],
            realCount: 3,
          }),
        );
        expect(await listed).toEqual({ status: "ok" });
        expect(rig.handle.state().hidden).toBe(2);
        const take = rig.handle.act.takeMailMoney(101);
        await flushMicrotasks();
        await elapse(MAIL_ANSWER_MS);
        expect(await take).toEqual({ status: "unanswered" });
        const refresh = rig.handle.act.listMail(MAILBOX_OBJECT);
        let settled: string | undefined;
        refresh.then((result) => {
          settled = result.status;
        });
        await flushMicrotasks();
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 1, id: 101 }),
        );
        await flushMicrotasks();
        expect(rig.handle.state().inbox[0]?.money).toBe(0);
        expect(settled).toBeUndefined();
        expect(rig.handle.state().pending).toBeUndefined();
        rig.inject(
          GameOpcode.SMSG_MAIL_LIST_RESULT,
          mailListResultBody({ mails: [{ id: 205 }] }),
        );
        expect(await refresh).toEqual({ status: "ok" });
        expect(rig.handle.state().inbox.map((mail) => mail.id)).toEqual([205]);
        expect(rig.handle.state().hidden).toBe(0);
      } finally {
        rig.dispose();
      }
    });
  });

  test("a list refresh with no reply ends unanswered", async () => {
    await withFakeTimers(async () => {
      const rig = mailRig();
      try {
        const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
        await flushMicrotasks();
        rig.inject(
          GameOpcode.SMSG_MAIL_LIST_RESULT,
          mailListResultBody({ mails: [{ id: 101, money: 250 }] }),
        );
        expect(await listed).toEqual({ status: "ok" });
        const take = rig.handle.act.takeMailMoney(101);
        await flushMicrotasks();
        await elapse(MAIL_ANSWER_MS);
        expect(await take).toEqual({ status: "unanswered" });
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 1, id: 101 }),
        );
        await flushMicrotasks();
        expect(rig.handle.state().pending).toBeUndefined();
        const refresh = rig.handle.act.listMail(MAILBOX_OBJECT);
        await flushMicrotasks();
        await elapse(MAIL_ANSWER_MS);
        expect(await refresh).toEqual({ status: "unanswered" });
      } finally {
        rig.dispose();
      }
    });
  });
});
