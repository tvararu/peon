import { describe, expect, test } from "bun:test";
import {
  MAILBOX_OBJECT,
  mailListResultBody,
  mailRig,
  mailSendMailResultBody,
} from "#test-support/areas/mail";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { flushMicrotasks } from "#test-support/microtasks";
import { MAIL_ANSWER_MS } from "#wow/areas/mail/runtime";
import { GameOpcode } from "#wow/protocol/opcodes";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function listedRig() {
  const rig = mailRig({ coinage: 1000, name: "Target" });
  const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
  await flush();
  rig.inject(GameOpcode.SMSG_MAIL_LIST_RESULT, mailListResultBody({}));
  if ((await listed).status !== "ok") throw new Error("list failed");
  return rig;
}

const sentMails = (rig: Awaited<ReturnType<typeof listedRig>>) =>
  rig.sent.filter((row) => row.opcode === GameOpcode.CMSG_SEND_MAIL);

describe("mail send attachments", () => {
  test("a repeated attachment guid is refused before anything is sent", async () => {
    const rig = await listedRig();
    try {
      await expect(
        rig.handle.act.sendMail({
          body: "",
          items: [
            { guid: 1001n, slot: 23 },
            { guid: 1001n, slot: 23 },
          ],
          receiver: "Friend",
          subject: "",
        }),
      ).rejects.toThrow("duplicate_attachment");
      expect(sentMails(rig)).toEqual([]);
      expect(rig.handle.state().pending).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("distinct attachment guids still send", async () => {
    const rig = await listedRig();
    try {
      const pending = rig.handle.act.sendMail({
        body: "",
        items: [
          { guid: 1001n, slot: 23 },
          { guid: 1002n, slot: 24 },
        ],
        receiver: "Friend",
        subject: "",
      });
      await flush();
      expect(sentMails(rig)).toHaveLength(1);
      expect(rig.handle.state().pending).toBeDefined();
      void pending.catch(() => undefined);
    } finally {
      rig.dispose();
    }
  });
});

describe("mail send after a timeout", () => {
  const letter = {
    body: "",
    receiver: "Friend",
    subject: "",
  };

  test("a timed-out send stays unresolved so its late reply cannot settle the next send", async () => {
    const rig = await listedRig();
    try {
      await withFakeTimers(async () => {
        const first = rig.handle.act.sendMail(letter);
        await flushMicrotasks();
        await elapse(MAIL_ANSWER_MS);
        expect(await first).toEqual({ status: "unanswered" });
        expect(rig.handle.state().pending).toEqual({ action: "send", id: 0 });
        await expect(rig.handle.act.sendMail(letter)).rejects.toThrow(
          "mail_busy",
        );
        expect(sentMails(rig)).toHaveLength(1);
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 0, id: 0, result: 4 }),
        );
        expect(rig.handle.state().pending).toBeUndefined();
        const second = rig.handle.act.sendMail(letter);
        await flushMicrotasks();
        expect(sentMails(rig)).toHaveLength(2);
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 0, id: 0, result: 0 }),
        );
        expect(await second).toEqual({ status: "ok" });
      });
    } finally {
      rig.dispose();
    }
  });
});

describe("mail take after a timeout", () => {
  test("a delayed GUID-less refusal cannot settle the next attachment", async () => {
    const rig = mailRig();
    try {
      await withFakeTimers(async () => {
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
          mailSendMailResultBody({ action: 2, id: 102, result: 6 }),
        );
        expect(rig.handle.state().pending).toBeUndefined();
        const second = rig.handle.act.takeMailItem(102, 78);
        await flushMicrotasks();
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 2, count: 3, id: 102, itemLow: 78 }),
        );
        expect(await second).toEqual({ itemLow: 78, status: "ok" });
      });
    } finally {
      rig.dispose();
    }
  });
});
