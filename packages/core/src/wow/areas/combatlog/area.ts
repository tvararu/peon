import {
  damageShieldEntry,
  dispelEntries,
  dispelFailedEntries,
  energizeEntry,
  environmentalEntry,
  healEntry,
  immuneEntry,
  instakillEntry,
  meleeEntry,
  missEntry,
  periodicEntries,
  spellDamageEntry,
  spellMissEntries,
} from "#wow/areas/combatlog/entries";
import { COMBATLOG_OPCODES } from "#wow/areas/combatlog/opcodes";
import {
  parseAttackerState,
  parseComboPoints,
  parseDamageShield,
  parseDispelFailed,
  parseDispelLog,
  parseEnvironmentalDamage,
  parseInstakill,
  parsePartyKill,
  parsePeriodicAuraLog,
  parsePowerUpdate,
  parseSpellDamage,
  parseSpellEnergize,
  parseSpellHeal,
  parseSpellImmune,
  parseSpellMiss,
} from "#wow/areas/combatlog/protocol";
import { combatlogRuntime } from "#wow/areas/combatlog/runtime";
import { CombatlogStore } from "#wow/areas/combatlog/store";
import { type AreaRegister, defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";
import { parseSpellGo } from "#wow/protocol/spell";

function registerDispels(wire: AreaRegister, store: CombatlogStore): void {
  wire.on(GameOpcode.SMSG_SPELLDISPELLOG, (r) =>
    store.receive(dispelEntries("dispel", parseDispelLog(r))),
  );
  wire.on(GameOpcode.SMSG_SPELLSTEALLOG, (r) =>
    store.receive(dispelEntries("steal", parseDispelLog(r))),
  );
  wire.on(GameOpcode.SMSG_DISPEL_FAILED, (r) =>
    store.receive(dispelFailedEntries(parseDispelFailed(r))),
  );
}

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
    wire.on(GameOpcode.SMSG_SPELLLOGMISS, (r) =>
      store.receive(spellMissEntries(parseSpellMiss(r))),
    );
    wire.on(GameOpcode.SMSG_SPELLORDAMAGE_IMMUNE, (r) =>
      store.receive([immuneEntry(parseSpellImmune(r))]),
    );
    wire.on(GameOpcode.SMSG_SPELLDAMAGESHIELD, (r) =>
      store.receive([damageShieldEntry(parseDamageShield(r))]),
    );
    wire.on(GameOpcode.SMSG_ENVIRONMENTAL_DAMAGE_LOG, (r) =>
      store.receive([environmentalEntry(parseEnvironmentalDamage(r))]),
    );
    wire.on(GameOpcode.SMSG_SPELLINSTAKILLLOG, (r) =>
      store.receive([instakillEntry(parseInstakill(r))]),
    );
    registerDispels(wire, store);
    wire.peek(GameOpcode.SMSG_SPELL_GO, (r) => {
      const go = parseSpellGo(r);
      store.receive(
        go.misses.map((miss) =>
          missEntry(go.caster, miss.guid, go.spellId, miss.reason),
        ),
      );
    });
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
