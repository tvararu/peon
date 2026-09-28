import { defineArea } from "#wow/areas/contract";
import { LOGIN_OPCODES } from "#wow/areas/login/opcodes";
import {
  parseAccountDataTimes,
  parseAddonInfo,
  parseClientCacheVersion,
  parseFeatureSystemStatus,
  parseLearnedDanceMoves,
  parseTutorialFlags,
} from "#wow/areas/login/protocol";
import { LoginStore } from "#wow/areas/login/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const loginArea = defineArea({
  name: "login",
  opcodes: LOGIN_OPCODES,
  eventTypes: ["login_noise", "account_data_times"],
  store: () => new LoginStore(),
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
  },
});
