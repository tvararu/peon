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

const letter = { body: "", receiver: "Friend", subject: "" };
const itemMail = {
  mails: [{ id: 102, items: [{ count: 5, entry: 159, low: 77 }] }],
};

async function listedRig() {
  const rig = mailRig({ coinage: 1000, name: "Target" });
  const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
  await flushMicrotasks();
  rig.inject(GameOpcode.SMSG_MAIL_LIST_RESULT, mailListResultBody(itemMail));
  if ((await listed).status !== "ok") throw new Error("list failed");
  return rig;
}

describe("mail list refresh during an action", () => {
  test("a refresh answered during a send keeps the send's guard", async () => {
    const rig = await listedRig();
    try {
      await withFakeTimers(async () => {
        const refresh = rig.handle.act.listMail(MAILBOX_OBJECT);
        await flushMicrotasks();
        const first = rig.handle.act.sendMail(letter);
        await flushMicrotasks();
        rig.inject(
          GameOpcode.SMSG_MAIL_LIST_RESULT,
          mailListResultBody(itemMail),
        );
        expect(await refresh).toEqual({ status: "ok" });
        expect(rig.handle.state().pending).toEqual({ action: "send", id: 0 });
        await expect(rig.handle.act.sendMail(letter)).rejects.toThrow(
          "mail_busy",
        );
        expect(
          rig.sent.filter((row) => row.opcode === GameOpcode.CMSG_SEND_MAIL),
        ).toHaveLength(1);
        let settled = false;
        void first.then(() => {
          settled = true;
        });
        await flushMicrotasks();
        expect(settled).toBe(false);
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 0, id: 0, result: 0 }),
        );
        expect(await first).toEqual({ status: "ok" });
        expect(rig.handle.state().pending).toBeUndefined();
      });
    } finally {
      rig.dispose();
    }
  });

  test("a refresh answered during a take keeps the take's guard", async () => {
    const rig = await listedRig();
    try {
      await withFakeTimers(async () => {
        const refresh = rig.handle.act.listMail(MAILBOX_OBJECT);
        await flushMicrotasks();
        const first = rig.handle.act.takeMailItem(102, 77);
        await flushMicrotasks();
        rig.inject(
          GameOpcode.SMSG_MAIL_LIST_RESULT,
          mailListResultBody(itemMail),
        );
        expect(await refresh).toEqual({ status: "ok" });
        expect(rig.handle.state().pending).toEqual({
          action: "item_taken",
          id: 102,
          itemLow: 77,
        });
        await expect(rig.handle.act.takeMailItem(102, 77)).rejects.toThrow(
          "mail_busy",
        );
        expect(
          rig.sent.filter(
            (row) => row.opcode === GameOpcode.CMSG_MAIL_TAKE_ITEM,
          ),
        ).toHaveLength(1);
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 2, count: 5, id: 102, itemLow: 77 }),
        );
        expect(await first).toEqual({ itemLow: 77, status: "ok" });
        expect(rig.handle.state().pending).toBeUndefined();
      });
    } finally {
      rig.dispose();
    }
  });

  test("a refresh clears the guard only once its act timed out", async () => {
    const rig = await listedRig();
    try {
      await withFakeTimers(async () => {
        const first = rig.handle.act.sendMail(letter);
        await flushMicrotasks();
        await elapse(MAIL_ANSWER_MS);
        expect(await first).toEqual({ status: "unanswered" });
        const refresh = rig.handle.act.listMail(MAILBOX_OBJECT);
        await flushMicrotasks();
        rig.inject(
          GameOpcode.SMSG_MAIL_LIST_RESULT,
          mailListResultBody(itemMail),
        );
        expect(await refresh).toEqual({ status: "ok" });
        expect(rig.handle.state().pending).toBeUndefined();
        const second = rig.handle.act.sendMail(letter);
        await flushMicrotasks();
        expect(
          rig.sent.filter((row) => row.opcode === GameOpcode.CMSG_SEND_MAIL),
        ).toHaveLength(2);
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
