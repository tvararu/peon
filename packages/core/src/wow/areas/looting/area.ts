import { defineArea } from "#wow/areas/contract";
import { LOOTING_OPCODES } from "#wow/areas/looting/opcodes";
import {
  parseLootList,
  parseLootMasterList,
} from "#wow/areas/looting/protocol";
import { lootingRuntime } from "#wow/areas/looting/runtime";
import { LootingStore } from "#wow/areas/looting/store";
import {
  parseLootReleaseResponse,
  parseLootRemoved,
  parseLootResponse,
} from "#wow/protocol/loot";
import { GameOpcode } from "#wow/protocol/opcodes";

export const lootingArea = defineArea({
  name: "looting",
  opcodes: LOOTING_OPCODES,
  eventTypes: [
    "loot_owner",
    "master_loot_candidates",
    "loot_removed",
    "loot_error",
  ],
  store: (deps, core) => new LootingStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_LOOT_LIST, (r) =>
      store.receiveLootList(parseLootList(r)),
    );
    wire.on(GameOpcode.SMSG_LOOT_MASTER_LIST, (r) =>
      store.receiveMasterList(parseLootMasterList(r)),
    );
    wire.peek(GameOpcode.SMSG_LOOT_REMOVED, (r) =>
      store.receiveLootRemoved(parseLootRemoved(r)),
    );
    wire.peek(GameOpcode.SMSG_LOOT_RESPONSE, (r) =>
      store.receiveLootError(parseLootResponse(r)),
    );
    wire.peek(GameOpcode.SMSG_LOOT_RELEASE_RESPONSE, (r) => {
      parseLootReleaseResponse(r);
      store.clearMasterCandidates();
    });
  },
  runtime: lootingRuntime,
});
