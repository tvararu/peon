import { defineArea } from "#wow/areas/contract";
import { GUARD_OPCODES } from "#wow/areas/guard/opcodes";
import {
  parseNotification,
  parseReadyForRedirect,
  parseWardenData,
} from "#wow/areas/guard/protocol";
import { guardRuntime } from "#wow/areas/guard/runtime";
import { GuardStore } from "#wow/areas/guard/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const guardArea = defineArea({
  name: "guard",
  opcodes: GUARD_OPCODES,
  eventTypes: ["warden_request", "redirect_ready", "notification"],
  store: () => new GuardStore(),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_WARDEN_DATA, (reader) => {
      store.receiveWardenRequest(parseWardenData(reader));
    });
    wire.on(GameOpcode.TC9_SMSG_READY_FOR_REDIRECT, (reader) => {
      store.receiveRedirectReady(parseReadyForRedirect(reader));
    });
    wire.peek(GameOpcode.SMSG_NOTIFICATION, (reader) => {
      store.receiveNotification(parseNotification(reader));
    });
  },
  runtime: guardRuntime,
});
