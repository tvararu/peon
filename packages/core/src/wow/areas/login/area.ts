import { defineArea, emptyStore } from "#wow/areas/contract";
import { LOGIN_OPCODES } from "#wow/areas/login/opcodes";

export const loginArea = defineArea({
  name: "login",
  opcodes: LOGIN_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
