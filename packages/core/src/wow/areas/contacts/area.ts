import { CONTACTS_OPCODES } from "#wow/areas/contacts/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const contactsArea = defineArea({
  name: "contacts",
  opcodes: CONTACTS_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
