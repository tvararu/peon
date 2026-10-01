import { defineArea } from "#wow/areas/contract";
import { MAIL_OPCODES } from "#wow/areas/mail/opcodes";
import {
  parseMailList,
  parseNextMailTime,
  parseReceivedMail,
  parseSendMailResult,
  parseShowMailbox,
} from "#wow/areas/mail/protocol";
import { mailRuntime } from "#wow/areas/mail/runtime";
import { MailStore } from "#wow/areas/mail/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const mailArea = defineArea({
  eventTypes: [
    "listed",
    "inbox_changed",
    "next_time",
    "new_mail",
    "mailbox_shown",
    "result",
  ],
  name: "mail",
  opcodes: MAIL_OPCODES,
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_MAIL_LIST_RESULT, (reader) => {
      store.receiveList(parseMailList(reader));
    });
    wire.on(GameOpcode.MSG_QUERY_NEXT_MAIL_TIME, (reader) => {
      store.receiveNextMailTime(parseNextMailTime(reader));
    });
    wire.peek(GameOpcode.SMSG_RECEIVED_MAIL, (reader) => {
      parseReceivedMail(reader);
      store.receiveReceivedMail();
    });
    wire.on(GameOpcode.SMSG_SHOW_MAILBOX, (reader) => {
      store.receiveMailboxShown(parseShowMailbox(reader));
    });
    wire.on(GameOpcode.SMSG_SEND_MAIL_RESULT, (reader) => {
      store.receiveSendMailResult(parseSendMailResult(reader));
    });
  },
  runtime: mailRuntime,
  store: (deps) => new MailStore(deps),
});
