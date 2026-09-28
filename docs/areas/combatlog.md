# combatlog

The `combatlog` area turns the server's combat log into entries. World
service code reads them through `session.areas.combatlog.state()`: a ring
of the last 500 entries, the totals of the current fight and of the last
one, the last 20 kills, the character's combo points, and the count of
dropped entries. Each entry names its kind (`melee`, `spell_damage` or
`kill` now), the source and target guids, the amount, and the
optional spell, overkill, school mask, absorbed, resisted and blocked
amounts, the crit flag and the outcome (`miss`, `dodge`, `parry`, `block`,
`evade`, `immune`, `deflect`, `interrupt`, or `absorb` and `resist` for a
full absorb or resist). The area emits one `entry` event per kept entry,
one `kill` event per kill, one `combo_points` event per combo point
update and one `fight_closed` event per fight. The state also lists the
immunities the character met: the creature entry and spell id of each
spell a creature refused, once per pair. The harness writes three quiet
`log` rows from them and no row for any other event:

- `combatlog/immune` when a spell or swing of the character meets an
  immune unit: an `immune` entry, a `miss` entry with outcome `immune`
  or `immune2`, or a swing with outcome `immune` (spell 0 in the row).
  The text names the unit and the spell id, such as `Mottled Boar u5 is
  immune to spell 122.` It is written once per creature entry and spell
  in a session, or once per unit and spell for a unit that is not a
  creature.
- `combatlog/fight` when a fight closes: `Fight over: dealt 312, took 145
  (1 dodge, 1 resist).` The text adds `, healed N` when the character
  was healed, and drops the brackets when nothing was avoided.
- `combatlog/killing_blow` when another player kills the character's
  target (`ourTarget` 1, `bySelf` 0, `killerKind` `player`). A kill by
  the character writes no row here; its `combat/kill_credit` row covers
  it. The server's `SMSG_PARTYKILLLOG` names the loot recipient as the
  killer and goes only to that player or its group
  (`Entities/Unit/Unit.cpp:13593`, `Entities/Unit/Unit.cpp:13611`), so
  the row fires only when a member of the character's group gets the
  kill credit; a stranger who kills the character's target is never
  seen.

A power update
goes to the unit in the entity store, not to the combat log.

- The store keeps an entry whose source or target is the character, a
  unit it summoned or created (its pet, a guardian or a totem), or a unit
  of the current fight. A unit joins the fight when it appears opposite
  the character or its units in a kept entry, or when it attacks the
  character. Every other entry is dropped and counted in `dropped`.
- A fight opens on the first entry of the character or its units after 6
  seconds of quiet, and closes 6 seconds after the last kept entry: a
  runtime timer, armed by each kept entry and not at build, calls
  `closeFight()`, and a read or an entry after the gap closes it too. Each
  close emits one `fight_closed` event with the totals. Its totals sum the damage dealt and taken, the heals the
  character received, the crits of the character and its units, and the
  misses by outcome.
- Damage to the character from a unit that never sent an attack start,
  such as a caster, marks that unit as an attacker of the character.
- A kill names the killer and the victim, whether the character made it
  (`bySelf`), whether the victim was the character's target (`ourTarget`,
  from the character's target field), and the killer's kind: `self`,
  `pet` (a unit the character summoned or created), `player`, `creature`,
  or `unknown` when the entity store does not know the killer. A kill is
  kept in the ring as one `kill` entry with amount 0 and in the kill list
  whatever the fight scope, and it does not count in the fight totals.
  The `kill` event carries `bySelf` and `ourTarget` as 1 or 0.
- An immunity is recorded when an entry of the character or its units
  that names a spell (an `immune` entry, or a `miss` entry with outcome
  `immune` or `immune2`) hits a creature (guid high `0xF130` or
  `0xF150`); a swing with no spell records nothing. Nothing writes such
  an entry until `combat-log-3` parses `SMSG_SPELLORDAMAGE_IMMUNE` and
  `SMSG_SPELLLOGMISS`.
- The combo points are the target and the points of the last update.
  An update with no target or with 0 points clears them. The `combo_points`
  event carries the points and the target when there is one.
- A power update sets the unit's power field (`UNIT_FIELD_POWER1` plus
  the power index) and the same slot of its typed power list in one
  entity store update, so the store emits one `update` event and
  `combatUnitOf` reads the new value at once. An update for a unit the
  entity store does not know, or for a power index past the seventh,
  changes nothing. It adds no entry and emits no area event.

## Wire notes

AzerothCore wins over wow_messages in each of these disagreements. The
layouts the area reads now are in the first and second items and in the
last two items, which are not disagreements.

- `SMSG_ATTACKERSTATEUPDATE` writes one absorb `u32` and one resist
  `u32` per sub-damage when their flags are set
  (`Entities/Unit/Unit.cpp:6677-6691`), and writes the extra `u32` after
  the victim state on `HITINFO_RAGE_GAIN` (0x800000,
  `Entities/Unit/Unit.cpp:6700-6701`).
  `wow_message_parser/wowm/world/combat/smsg_attackerstateupdate_3_3_5.wowm`
  reads one absorb and one resist in all (lines 72-77) and gates the
  extra `u32` on `UNK19` (lines 85-87). The sub-damage count is a `u8`
  of at most 2, and each sub-damage is a school mask `u32`, the damage as
  an `f32` and the damage as a `u32`.
- `SMSG_SPELLNONMELEEDAMAGELOG` carries a school mask `u8`
  (`Entities/Unit/Unit.cpp:6476`) and `SPELL_HIT_TYPE_*` flags
  (`Entities/Unit/Unit.cpp:6482`), then one debug byte
  (`Entities/Unit/Unit.cpp:6483`).
  `wow_message_parser/wowm/world/spell/smsg_spellnonmeleedamagelog.wowm`
  reads a school index (line 27) and the melee `HitInfo` flags (line 35).
  `SMSG_SPELLDAMAGESHIELD` also ends with a school mask `u32`
  (`Entities/Unit/Unit.cpp:2179-2187`), where
  `wow_message_parser/wowm/world/spell/smsg_spelldamageshield.wowm`
  reads a school index (line 26).
- The hit type flags are crit 0x2 and split 0x8
  (`src/server/shared/SharedDefines.h:1539-1544`); the spell miss
  reasons run from none to reflect
  (`src/server/shared/SharedDefines.h:1523-1534`); the victim states run
  from intact to deflects (`Entities/Unit/Unit.h:85-93`), and the hit
  info flags are in `Entities/Unit/Unit.h:98-123`.
- `SMSG_PERIODICAURALOG` writes the periodic damage school as a `u32`
  mask (`Entities/Unit/Unit.cpp:6585`), where
  `wow_message_parser/wowm/world/spell/smsg_periodicauralog.wowm` reads
  a `u8` school (line 963).
- `SMSG_ENVIRONMENTAL_DAMAGE_LOG` writes the resisted amount before the
  absorbed amount (`Server/Packets/CombatLogPackets.cpp:22-28`), where
  `wow_message_parser/wowm/world/combat/smsg_environmentaldamagelog.wowm`
  puts absorb first (lines 16-17).
- `SMSG_DISPEL_FAILED` writes the dispel spell before the failed auras
  (`Spells/SpellEffects.cpp:2779-2787`), where
  `wow_message_parser/wowm/world/spell/smsg_dispel_failed.wowm` counts it
  as a failed aura (lines 3-7).
- `SMSG_SPELLLOGEXECUTE` has a real per-effect target count, where
  `wow_message_parser/wowm/world/spell/smsg_spelllogexecute.wowm` fixes
  the count at 1 (line 605) and reads a guid for feed pet (line 640).
- The execute log counts each target of an effect
  (`Spells/Spell.cpp:8838-8845`), logs power burn
  (`Spells/SpellEffects.cpp:1553`), and logs feed pet as an item entry
  (`Spells/SpellEffects.cpp:4758`).

- `SMSG_PARTYKILLLOG` writes the killer and the victim as two full
  `u64` guids (`Entities/Unit/Unit.cpp:13583-13585`). The killer is the
  player that gets the kill: the owner of a pet or charmed killer
  (`Entities/Unit/Unit.cpp:13548`), or the loot recipient or a member of
  its group (`Entities/Unit/Unit.cpp:13560-13571`), so this server never
  names a pet or a creature as the killer. The server sends the log to
  that player alone, or to the player's group.
- `SMSG_UPDATE_COMBO_POINTS` writes the target as a packed guid, a single
  0 byte when there is no target, then the points as a `u8`
  (`Entities/Unit/Unit.cpp:12851-12857`).
- `SMSG_POWER_UPDATE` writes the unit as a packed guid, the power index
  as a `u8` and the new value as a `u32`
  (`Entities/Unit/Unit.cpp:12015-12019`). `Unit::SetPower` sends it to
  the unit and the players that see it whenever its `withPowerUpdate`
  argument is set, which is the default (`Entities/Unit/Unit.cpp:11996`).

## Harness readers

- `engage` (`tools/engage-tally.ts`) sums the entries since the run
  started (`areas/combatlog/totals.ts`): damage the character or its pet
  dealt, damage the character took, healing it received, its own misses
  and the target's dodges, parries and blocks, and the spells its
  targets refused. A `DONE` or `PARTLY` line adds `Dealt 312, took 145;
  avoided: dodge x1; immune: Frost Nova.` when the log holds any of
  them, and the `after` block carries `dealt`, `taken`, `healed`,
  `avoided` and `immune`; the refusals also count as the cast error
  word `immune`.
- Jev's observation (`loops/combat-actions.ts`) has a `combatLog` block:
  damage taken in the last 6 s by source and school mask, the
  character's own misses in the last 6 s, the target's known immunities
  and the combo points held on the target. A hostile spell in the
  target's immunities reads `immune` in `unavailable` and is no
  candidate.
- `[now]`, the footer and `VitalsView` show `CP 3` while the character
  holds combo points on a target, and nothing at 0.

## Left out

- The human engage line (`ui/renderers/live-run.ts`) does not show the
  fight totals; only the model-facing result line does.
- `EngageAfter.dealt`, `taken`, `healed`, `avoided` and `immune` are
  optional, because `tools/engage.ts` builds an empty block.

- `SMSG_SPELLHEALLOG`, `SMSG_SPELLENERGIZELOG` and
  `SMSG_PERIODICAURALOG`: built by `combat-log-2`.
- `SMSG_SPELLLOGMISS`, `SMSG_SPELLORDAMAGE_IMMUNE`,
  `SMSG_SPELLDAMAGESHIELD`, `SMSG_ENVIRONMENTAL_DAMAGE_LOG` and
  `SMSG_SPELLINSTAKILLLOG`: built by `combat-log-3`.
- `SMSG_SPELLDISPELLOG`, `SMSG_DISPEL_FAILED` and `SMSG_SPELLSTEALLOG`:
  built by `combat-log-4`.
- `SMSG_SPELLLOGEXECUTE`: built by `combat-log-5`.
- Party scope: an entry between a party member and a unit outside the
  current fight is dropped, because the store has no party view. The
  entry of a party member against a unit of the character's fight is
  kept.
- The dead rows `SMSG_PROCRESIST`, `SMSG_FEIGN_DEATH_RESISTED` and
  `SMSG_HEALTH_UPDATE` have no code (see "Proof").

## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_ATTACKERSTATEUPDATE` | `live` | probe flow `combatlog-fight` (`--arg spell=133`, `--expect` 0x14A and 0x250) on an `eversong10-mage` moved to East Sanctum with `soap gm tele EastSanctum`, exit 0; 22 received, all `handled`, with swings of the character at an Angershade and of the Angershade at the character | `Entities/Unit/Unit.cpp:6661-6720` |
| `SMSG_SPELLNONMELEEDAMAGELOG` | `live` | probe flow `combatlog-fight`, exit 0; `handled`, Fireball (spell 133) of the character for 20 fire damage; an earlier run of the flow also received a creature's spell hit on the character | `Entities/Unit/Unit.cpp:6470-6483` |
| `SMSG_PARTYKILLLOG` | `live` | probe flow `combatlog-fight` (`--arg spell=133`, `--expect` 0x1F5) on an `eversong10-mage` moved to East Sanctum with `soap gm tele EastSanctum`, exit 0; 1 received, `handled`, when the character killed an Angershade (killer 0xe06, the character; victim 0xf130003d28014808), and `state.kills` held one kill with `killerKind` `self` and `ourTarget` true. The protocol test parses this body, and a body the server sent in an earlier run, before the handler existed | `Entities/Unit/Unit.cpp:13583-13585` |
| `SMSG_UPDATE_COMBO_POINTS` | `mock` | not seen live: no preset is a rogue or a druid, and `soap gm` cannot change a class. The maintainer can add a rogue preset for a live proof. The area test injects bodies built from the writer, with and without a target | `Entities/Unit/Unit.cpp:12851-12857` |
| `SMSG_POWER_UPDATE` | `live` | probe flow `combatlog-fight` (`--arg spell=133`, `--expect` 0x480) on an `eversong10-mage` moved to East Sanctum with `soap gm tele EastSanctum`, exit 0; 8 received, all `handled`: the character's powers at login, its mana (power 0) falling from 621 to 601 just before the first Fireball's `SMSG_SPELL_GO`, and power 0 of the Angershade it killed (victim 0xf130003d28015b6b, value 0). The protocol test parses both bodies | `Entities/Unit/Unit.cpp:12015-12019` |
| `SMSG_PROCRESIST` | `dead` | its only writer, `Unit::SendSpellDamageResist`, has no caller: the declaration and the definition are the only hits | `Entities/Unit/Unit.cpp:6616-6624` |
| `SMSG_FEIGN_DEATH_RESISTED` | `dead` | both send sites are inside comment blocks | `Spells/Auras/SpellAuraEffects.cpp:2953-2958` |
| `SMSG_HEALTH_UPDATE` | `dead` | no send site: only the opcode list and the opcode table name it | `Server/Protocol/Opcodes.h:1181` |

Flood guard, measured on a `t3-ghostlands-kill` run with
`--packet-trace headers`: 3 fights, 0 `combatlog/*` rows in each, and 243
game log rows (240 `log`, 3 `passive`) over 12 agent turns, about 20 rows
per turn. The run received 25 `SMSG_ATTACKERSTATEUPDATE`, 15
`SMSG_SPELLNONMELEEDAMAGELOG` and 2 `SMSG_PARTYKILLLOG`, all `handled`.
Both kill logs were kills by the character, which write no row. A
creature took the third kill, and no player earned the kill, so the
reward was not allowed (`Entities/Unit/Unit.cpp:13551-13557`) and the
server sent no kill log (`Entities/Unit/Unit.cpp:13581`). No
`combatlog/immune` or `combatlog/killing_blow` row has been seen live:
the area test writes both rows from hand-built entries.

Fight totals, measured on a `t3-ghostlands-kill` run (round 21, verdict
`pass`): one `engage` call killed two Shadowpine Oracles and answered
`DONE killed 2 Shadowpine Oracle ... +342 XP. Dealt 649, took 131.`. The
game log held two `combatlog/fight` rows, `Fight over: dealt 328, took
42.` and `Fight over: dealt 321, took 89.`, which sum to those figures,
and 2 `combatlog/*` rows among 146 game log rows. A `t7-halt-resume` run
(`pass`) gave three rows (`dealt 123, took 28 (1 miss)`, `dealt 122, took
33 (1 miss)`, `dealt 144, took 57`) and an `engage` line ending `Dealt
389, took 118.`. Two things stay unproved live. No immunity entry reaches
the store yet, so the Jev immune drop and the `immune:` clause of the
result line run only in unit tests until `combat-log-3` parses the spell
immunity packets. `SMSG_UPDATE_COMBO_POINTS` stays unseen, so `CP n` in
`[now]` and the footer is unit-tested only.
