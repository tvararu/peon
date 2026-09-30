import type { AreaOpcodes } from "#wow/areas/contract";

export const MAIL_OPCODES = {
  owns: [
    "CMSG_GET_MAIL_LIST",
    "SMSG_MAIL_LIST_RESULT",
    "CMSG_MAIL_MARK_AS_READ",
    "MSG_QUERY_NEXT_MAIL_TIME",
    "SMSG_SHOW_MAILBOX",
    "SMSG_RECEIVED_MAIL",
    "SMSG_SEND_MAIL_RESULT",
    "CMSG_MAIL_TAKE_MONEY",
    "CMSG_MAIL_TAKE_ITEM",
    "CMSG_MAIL_RETURN_TO_SENDER",
    "CMSG_MAIL_DELETE",
    "CMSG_MAIL_CREATE_TEXT_ITEM",
    "CMSG_SEND_MAIL",
  ],
  uses: [],
  stubs: [["SMSG_SEND_MAIL_RESULT", "Mail result"]],
  dead: [],
  unseen: ["SMSG_SHOW_MAILBOX"],
} as const satisfies AreaOpcodes;
