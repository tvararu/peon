import { describe, expect, test } from "bun:test";
import {
  MAIL_SENDER,
  MAILBOX_OBJECT,
  mailListResultBody,
  mailNextMailTimeBody,
  mailRig,
} from "#test-support/areas/mail";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import {
  buildGetMailList,
  buildMailMarkAsRead,
} from "#wow/areas/mail/protocol";
import { MAIL_ANSWER_MS } from "#wow/areas/mail/runtime";
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
