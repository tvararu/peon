import { defineArea } from "#wow/areas/contract";
import { REPUTATION_OPCODES } from "#wow/areas/reputation/opcodes";
import {
  parseInitializeFactions,
  parseSetFactionStanding,
  parseSetFactionVisible,
  parseSetForcedReactions,
} from "#wow/areas/reputation/protocol";
import { reputationRuntime } from "#wow/areas/reputation/runtime";
import { ReputationStore } from "#wow/areas/reputation/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const reputationArea = defineArea({
  name: "reputation",
  opcodes: REPUTATION_OPCODES,
  eventTypes: [
    "initialized",
    "standing_changed",
    "visible",
    "forced_changed",
    "watched_changed",
    "flags_pending",
  ],
  store: (deps, core) => new ReputationStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_INITIALIZE_FACTIONS, (r) =>
      store.initialize(parseInitializeFactions(r)),
    );
    wire.on(GameOpcode.SMSG_SET_FACTION_STANDING, (r) =>
      store.setStanding(parseSetFactionStanding(r)),
    );
    wire.on(GameOpcode.SMSG_SET_FACTION_VISIBLE, (r) =>
      store.setVisible(parseSetFactionVisible(r)),
    );
    wire.on(GameOpcode.SMSG_SET_FORCED_REACTIONS, (r) =>
      store.setForced(parseSetForcedReactions(r)),
    );
  },
  runtime: reputationRuntime,
});
