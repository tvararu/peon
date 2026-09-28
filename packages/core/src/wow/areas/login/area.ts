import { defineArea } from "#wow/areas/contract";
import { LOGIN_OPCODES } from "#wow/areas/login/opcodes";
import {
  parseAccountDataTimes,
  parseAddonInfo,
  parseCharacterLoginFailed,
  parseClientCacheVersion,
  parseFeatureSystemStatus,
  parseLearnedDanceMoves,
  parsePong,
  parseTutorialFlags,
} from "#wow/areas/login/protocol";
import { loginRuntime } from "#wow/areas/login/runtime";
import { LoginStore } from "#wow/areas/login/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const loginArea = defineArea({
  name: "login",
  opcodes: LOGIN_OPCODES,
  eventTypes: [
    "login_noise",
    "account_data_times",
    "pong",
    "login_failed",
    "logout_cancelled",
  ],
  store: (deps) => new LoginStore(deps.now),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_ADDON_INFO, (r) =>
      store.receiveAddonInfo(parseAddonInfo(r)),
    );
    wire.on(GameOpcode.SMSG_CLIENTCACHE_VERSION, (r) =>
      store.receiveClientCacheVersion(parseClientCacheVersion(r)),
    );
    wire.on(GameOpcode.SMSG_TUTORIAL_FLAGS, (r) =>
      store.receiveTutorialFlags(parseTutorialFlags(r)),
    );
    wire.on(GameOpcode.SMSG_ACCOUNT_DATA_TIMES, (r) =>
      store.receiveAccountDataTimes(parseAccountDataTimes(r)),
    );
    wire.on(GameOpcode.SMSG_FEATURE_SYSTEM_STATUS, (r) =>
      store.receiveFeatureSystemStatus(parseFeatureSystemStatus(r)),
    );
    wire.on(GameOpcode.SMSG_LEARNED_DANCE_MOVES, (r) =>
      store.receiveLearnedDanceMoves(parseLearnedDanceMoves(r)),
    );
    wire.on(GameOpcode.SMSG_PONG, (r) => store.receivePong(parsePong(r)));
    wire.on(GameOpcode.SMSG_CHARACTER_LOGIN_FAILED, (r) =>
      store.receiveCharacterLoginFailed(parseCharacterLoginFailed(r)),
    );
    wire.on(GameOpcode.SMSG_LOGOUT_CANCEL_ACK, () =>
      store.receiveLogoutCancelAck(),
    );
  },
  runtime: loginRuntime,
});
