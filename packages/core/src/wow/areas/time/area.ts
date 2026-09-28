import { defineArea } from "#wow/areas/contract";
import { TIME_OPCODES } from "#wow/areas/time/opcodes";
import {
  parseLoginSetTimeSpeed,
  parseTimeQueryResponse,
  parseUiTimerUpdate,
} from "#wow/areas/time/protocol";
import { timeRuntime } from "#wow/areas/time/runtime";
import { TimeStore } from "#wow/areas/time/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const timeArea = defineArea({
  name: "time",
  opcodes: TIME_OPCODES,
  eventTypes: ["set_speed", "query_reply", "ui_time"],
  store: (deps) => new TimeStore(deps.now),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_LOGIN_SETTIMESPEED, (r) =>
      store.receiveSetSpeed(parseLoginSetTimeSpeed(r)),
    );
    wire.on(GameOpcode.SMSG_QUERY_TIME_RESPONSE, (r) =>
      store.receiveQueryReply(parseTimeQueryResponse(r)),
    );
    wire.on(GameOpcode.SMSG_WORLD_STATE_UI_TIMER_UPDATE, (r) =>
      store.receiveUiTime(parseUiTimerUpdate(r).gameTime),
    );
  },
  runtime: timeRuntime,
});
