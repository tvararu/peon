import {
  energizeEntry,
  healEntry,
  meleeEntry,
  periodicEntries,
  spellDamageEntry,
} from "#wow/areas/combatlog/entries";
import { COMBATLOG_OPCODES } from "#wow/areas/combatlog/opcodes";
import {
  parseAttackerState,
  parseComboPoints,
  parsePartyKill,
  parsePeriodicAuraLog,
  parsePowerUpdate,
  parseSpellDamage,
  parseSpellEnergize,
  parseSpellHeal,
} from "#wow/areas/combatlog/protocol";
import { combatlogRuntime } from "#wow/areas/combatlog/runtime";
import { CombatlogStore } from "#wow/areas/combatlog/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export const combatlogArea = defineArea({
  name: "combatlog",
  opcodes: COMBATLOG_OPCODES,
  eventTypes: ["entry", "combo_points", "kill", "fight_closed"],
  store: (deps, core) => new CombatlogStore(deps, core),
  runtime: (ctx, store) => combatlogRuntime(ctx, store),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_ATTACKERSTATEUPDATE, (r) =>
      store.receive([meleeEntry(parseAttackerState(r))]),
    );
    wire.on(GameOpcode.SMSG_SPELLNONMELEEDAMAGELOG, (r) =>
      store.receive([spellDamageEntry(parseSpellDamage(r))]),
    );
    wire.on(GameOpcode.SMSG_SPELLHEALLOG, (r) =>
      store.receive([healEntry(parseSpellHeal(r))]),
    );
    wire.on(GameOpcode.SMSG_SPELLENERGIZELOG, (r) =>
      store.receive([energizeEntry(parseSpellEnergize(r))]),
    );
    wire.on(GameOpcode.SMSG_PERIODICAURALOG, (r) =>
      store.receive(periodicEntries(parsePeriodicAuraLog(r))),
    );
    wire.on(GameOpcode.SMSG_PARTYKILLLOG, (r) =>
      store.receiveKill(parsePartyKill(r)),
    );
    wire.on(GameOpcode.SMSG_UPDATE_COMBO_POINTS, (r) =>
      store.receiveComboPoints(parseComboPoints(r)),
    );
    wire.on(GameOpcode.SMSG_POWER_UPDATE, (r) =>
      store.applyPower(parsePowerUpdate(r)),
    );
  },
});
