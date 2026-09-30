import { defineArea, emptyStore } from "#wow/areas/contract";
import { MAIL_OPCODES } from "#wow/areas/mail/opcodes";

export const mailArea = defineArea({
  name: "mail",
  opcodes: MAIL_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
