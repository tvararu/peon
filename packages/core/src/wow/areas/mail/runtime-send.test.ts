import { describe, expect, test } from "bun:test";
import {
  MAILBOX_OBJECT,
  mailListResultBody,
  mailRig,
} from "#test-support/areas/mail";
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
