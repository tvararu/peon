import { describe, expect, test } from "bun:test";
import {
  MAILBOX_OBJECT,
  mailListResultBody,
  mailRig,
  mailSendMailResultBody,
} from "#test-support/areas/mail";
import { GameOpcode } from "#wow/protocol/opcodes";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
describe("mail equip errors", () => {
  test("an equip error on a send, money take or copy releases the next action", async () => {
    const rig = mailRig({ coinage: 1000, name: "Target" });
    try {
      const listed = rig.handle.act.listMail(MAILBOX_OBJECT);
      await flush();
      rig.inject(
        GameOpcode.SMSG_MAIL_LIST_RESULT,
        mailListResultBody({
          mails: [{ body: "Hello", id: 101, money: 250 }],
        }),
      );
      expect(await listed).toEqual({ status: "ok" });
      const send = rig.handle.act.sendMail({
        body: "",
        receiver: "Friend",
        subject: "Hi",
      });
      await flush();
      rig.inject(
        GameOpcode.SMSG_SEND_MAIL_RESULT,
        mailSendMailResultBody({ action: 0, equipError: 21, id: 0, result: 1 }),
      );
      expect(await send).toEqual({ status: "refused", why: "equip_error" });
      const money = rig.handle.act.takeMailMoney(101);
      await flush();
      rig.inject(
        GameOpcode.SMSG_SEND_MAIL_RESULT,
        mailSendMailResultBody({
          action: 1,
          equipError: 21,
          id: 101,
          result: 1,
        }),
      );
      expect(await money).toEqual({ status: "refused", why: "equip_error" });
      const copy = rig.handle.act.copyMailText(101);
      await flush();
      rig.inject(
        GameOpcode.SMSG_SEND_MAIL_RESULT,
        mailSendMailResultBody({
          action: 5,
          equipError: 21,
          id: 101,
          result: 1,
        }),
      );
      expect(await copy).toEqual({ status: "refused", why: "equip_error" });
      const after = rig.handle.act.takeMailMoney(101);
      await flush();
      rig.inject(
        GameOpcode.SMSG_SEND_MAIL_RESULT,
        mailSendMailResultBody({ action: 1, id: 101 }),
      );
      expect(await after).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });
});
