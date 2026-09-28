import { COMBATLOG_OPCODES } from "#wow/areas/combatlog/opcodes";
import {
  parseAttackerState,
  parseComboPoints,
  parsePartyKill,
  parseSpellDamage,
} from "#wow/areas/combatlog/protocol";
import {
  CombatlogStore,
  meleeEntry,
  spellDamageEntry,
} from "#wow/areas/combatlog/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export const combatlogArea = defineArea({
  name: "combatlog",
  opcodes: COMBATLOG_OPCODES,
  eventTypes: ["entry", "combo_points", "kill"],
  store: (deps, core) => new CombatlogStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_ATTACKERSTATEUPDATE, (r) =>
      store.receive([meleeEntry(parseAttackerState(r))]),
    );
    wire.on(GameOpcode.SMSG_SPELLNONMELEEDAMAGELOG, (r) =>
      store.receive([spellDamageEntry(parseSpellDamage(r))]),
    );
    wire.on(GameOpcode.SMSG_PARTYKILLLOG, (r) =>
      store.receiveKill(parsePartyKill(r)),
    );
    wire.on(GameOpcode.SMSG_UPDATE_COMBO_POINTS, (r) =>
      store.receiveComboPoints(parseComboPoints(r)),
    );
  },
});
