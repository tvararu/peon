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

async function listedCopyRig() {
  const rig = mailRig();
  const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
  await flushMicrotasks();
  rig.inject(
    GameOpcode.SMSG_MAIL_LIST_RESULT,
    mailListResultBody({ mails: [{ body: "Meet me at the inn.", id: 101 }] }),
  );
  if ((await listed).status !== "ok") throw new Error("list failed");
  return rig;
}

async function listedReturnRig() {
  const rig = mailRig();
  const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
  await flushMicrotasks();
  rig.inject(
    GameOpcode.SMSG_MAIL_LIST_RESULT,
    mailListResultBody({ mails: [{ id: 101 }] }),
  );
  if ((await listed).status !== "ok") throw new Error("list failed");
  return rig;
}

async function listedMoneyRig() {
  const rig = mailRig();
  const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
  await flushMicrotasks();
  rig.inject(
    GameOpcode.SMSG_MAIL_LIST_RESULT,
    mailListResultBody({ mails: [{ id: 101, money: 250 }] }),
  );
  if ((await listed).status !== "ok") throw new Error("list failed");
  return rig;
}

describe("mail timeout guard", () => {
  test("a delayed copy ok cannot settle a retry of the same letter", async () => {
    const rig = await listedCopyRig();
    try {
      await withFakeTimers(async () => {
        const first = rig.handle.act.copyMailText(101);
        await flushMicrotasks();
        await elapse(MAIL_ANSWER_MS);
        expect(await first).toEqual({ status: "unanswered" });
        expect(rig.handle.state().pending).toEqual({
          action: "made_permanent",
          id: 101,
        });
        await expect(rig.handle.act.copyMailText(101)).rejects.toThrow(
          "mail_busy",
        );
        expect(
          rig.sent.filter(
            (row) => row.opcode === GameOpcode.CMSG_MAIL_CREATE_TEXT_ITEM,
          ),
        ).toHaveLength(1);
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 5, id: 101 }),
        );
        await flushMicrotasks();
        expect(rig.handle.state().pending).toBeUndefined();
      });
    } finally {
      rig.dispose();
    }
  });

  test("a delayed return ok cannot settle a retry of the same letter", async () => {
    const rig = await listedReturnRig();
    try {
      await withFakeTimers(async () => {
        const first = rig.handle.act.returnMail(101);
        await flushMicrotasks();
        await elapse(MAIL_ANSWER_MS);
        expect(await first).toEqual({ status: "unanswered" });
        expect(rig.handle.state().pending).toEqual({
          action: "returned_to_sender",
          id: 101,
        });
        await expect(rig.handle.act.returnMail(101)).rejects.toThrow(
          "mail_busy",
        );
        expect(
          rig.sent.filter(
            (row) => row.opcode === GameOpcode.CMSG_MAIL_RETURN_TO_SENDER,
          ),
        ).toHaveLength(1);
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 3, id: 101 }),
        );
        await flushMicrotasks();
        expect(rig.handle.state().pending).toBeUndefined();
        expect(rig.handle.state().inbox).toEqual([]);
      });
    } finally {
      rig.dispose();
    }
  });

  test("a delayed money-take ok cannot settle a retry of the same letter", async () => {
    const rig = await listedMoneyRig();
    try {
      await withFakeTimers(async () => {
        const first = rig.handle.act.takeMailMoney(101);
        await flushMicrotasks();
        await elapse(MAIL_ANSWER_MS);
        expect(await first).toEqual({ status: "unanswered" });
        expect(rig.handle.state().pending).toEqual({
          action: "money_taken",
          id: 101,
        });
        await expect(rig.handle.act.takeMailMoney(101)).rejects.toThrow(
          "mail_busy",
        );
        expect(
          rig.sent.filter(
            (row) => row.opcode === GameOpcode.CMSG_MAIL_TAKE_MONEY,
          ),
        ).toHaveLength(1);
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 1, id: 101 }),
        );
        await flushMicrotasks();
        expect(rig.handle.state().pending).toBeUndefined();
        expect(rig.handle.state().inbox[0]?.money).toBe(0);
      });
    } finally {
      rig.dispose();
    }
  });

  test("a new list clears a guard the server silently dropped", async () => {
    const rig = await listedCopyRig();
    try {
      await withFakeTimers(async () => {
        const first = rig.handle.act.copyMailText(101);
        await flushMicrotasks();
        await elapse(MAIL_ANSWER_MS);
        expect(await first).toEqual({ status: "unanswered" });
        expect(rig.handle.state().pending).toBeDefined();
        const refresh = rig.handle.act.listMail(MAILBOX_OBJECT);
        await flushMicrotasks();
        rig.inject(
          GameOpcode.SMSG_MAIL_LIST_RESULT,
          mailListResultBody({
            mails: [{ body: "Meet me at the inn.", id: 101 }],
          }),
        );
        expect(await refresh).toEqual({ status: "ok" });
        expect(rig.handle.state().pending).toBeUndefined();
        const retry = rig.handle.act.copyMailText(101);
        await flushMicrotasks();
        expect(
          rig.sent.filter(
            (row) => row.opcode === GameOpcode.CMSG_MAIL_CREATE_TEXT_ITEM,
          ),
        ).toHaveLength(2);
        rig.inject(
          GameOpcode.SMSG_SEND_MAIL_RESULT,
          mailSendMailResultBody({ action: 5, id: 101 }),
        );
        expect(await retry).toEqual({ status: "ok" });
      });
    } finally {
      rig.dispose();
    }
  });

  test("dispose clears a guard the server silently dropped", async () => {
    const rig = await listedCopyRig();
    try {
      await withFakeTimers(async () => {
        const first = rig.handle.act.copyMailText(101);
        await flushMicrotasks();
        await elapse(MAIL_ANSWER_MS);
        expect(await first).toEqual({ status: "unanswered" });
        expect(rig.handle.state().pending).toBeDefined();
        rig.dispose();
        expect(rig.handle.state().pending).toBeUndefined();
      });
    } finally {
      rig.dispose();
    }
  });
});
