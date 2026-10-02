import { CONTACTS_OPCODES } from "#wow/areas/contacts/opcodes";
import { contactsRuntime } from "#wow/areas/contacts/runtime";
import { ContactStore } from "#wow/areas/contacts/store";
import { defineArea } from "#wow/areas/contract";
import { parseChatMessage } from "#wow/protocol/chat";
import { ChatType } from "#wow/protocol/enums";
import { GameOpcode } from "#wow/protocol/opcodes";
import { parseContactList } from "#wow/protocol/social";

export const contactsArea = defineArea({
  name: "contacts",
  opcodes: CONTACTS_OPCODES,
  eventTypes: ["contact_list", "note_set", "ignored_whisper"],
  store: () => new ContactStore(),
  register: (wire, store) => {
    wire.peek(GameOpcode.SMSG_CONTACT_LIST, (r) =>
      store.receiveContactList(parseContactList(r)),
    );
    wire.peek(GameOpcode.SMSG_MESSAGE_CHAT, (r) => {
      const message = parseChatMessage(r);
      if (
        message.type !== ChatType.WHISPER &&
        message.type !== ChatType.WHISPER_FOREIGN
      )
        return;
      if (message.senderGuidLow === 0) return;
      const guid =
        (BigInt(message.senderGuidHigh) << 32n) | BigInt(message.senderGuidLow);
      store.ignoredWhisper(guid);
    });
  },
  runtime: contactsRuntime,
});
