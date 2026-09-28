# threat

The `threat` area keeps the threat list the server sends for each engaged
creature. World-service code reads it through
`session.areas.threat.state()`: one table per creature, with the current
victim, the entries sorted by threat with each entry's share of the top
entry, and the threat another unit needs to pull the creature
(`pullAt`). It also keeps the last reaction of each creature
(`reactions`) and the time the character's own pet last reacted
(`petReaction`). The area emits `table`, `victim_changed`, `removed`,
`cleared`, `reaction` and `target_broken` events. A table or a reaction
goes away when its unit disappears or dies, and all of them go away on a
far teleport. A target break is only an event: it changes no state and
does not clear the character's selection.

In the harness, `look` rows of a creature with a table say "fighting
you" when the character is on its list, "aggro on" its current victim,
and "your threat" as the character's share of the top entry. The danger
view counts every creature with the character on its list as an
attacker, so a caster that never melees is counted, and a creature that
switches its victim to the character interrupts a run that stops on a
new attacker.

## Wire notes

AzerothCore and wow_messages agree on all seven bodies
(`wow_message_parser/wowm/world/threat/smsg_threat_update.wowm`,
`wow_message_parser/wowm/world/threat/smsg_highest_threat_update.wowm`,
`wow_message_parser/wowm/world/threat/smsg_threat_remove.wowm`,
`wow_message_parser/wowm/world/threat/smsg_threat_clear.wowm`,
`wow_message_parser/wowm/world/combat/smsg_ai_reaction.wowm`,
`wow_message_parser/wowm/world/spell/smsg_break_target.wowm`,
`wow_message_parser/wowm/world/spell/smsg_clear_target.wowm`).

- `SMSG_THREAT_UPDATE` is the packed guid of the creature, a `uint32`
  count, then per entry the packed guid of the victim and a `uint32`
  threat (`Combat/ThreatManager.cpp:880-898`). `SMSG_HIGHEST_THREAT_UPDATE`
  adds the packed guid of the new victim after the creature
  (`Combat/ThreatManager.cpp:884-885`).
- The threat value on the wire is threat x 100
  (`Combat/ThreatManager.cpp:894`). The area keeps the raw value.
- The list is in heap order, not sorted (`Combat/ThreatManager.cpp:889`),
  and skips references that are not available
  (`Combat/ThreatManager.cpp:891-892`), so it may hold no entry. The area
  sorts the entries itself.
- Each update is the full list, not a delta: an entry missing from the
  next update is gone.
- The server sends a list at most once a second per creature
  (`Combat/ThreatManager.h:94`) to every player that sees the creature,
  so the area also holds tables of fights the character is not in.
- `SMSG_THREAT_REMOVE` is the packed guid of the creature and of the
  victim that left the list (`Combat/ThreatManager.cpp:872-878`).
  `SMSG_THREAT_CLEAR` is the packed guid of the creature
  (`Combat/ThreatManager.cpp:865-870`).
- A new unit takes the creature from the current victim above 110% of
  the victim's threat in melee range and above 130% at range
  (`Combat/ThreatManager.cpp:655-678`); `pullAt` holds both values.
- `SMSG_AI_REACTION` is the full 8-byte guid of the unit and a `uint32`
  reaction (`Entities/Creature/Creature.cpp:2477-2487`).
- The reaction values are `ALERT` 0, `FRIENDLY` 1, `HOSTILE` 2, `AFRAID`
  3 and `DESTROY` 4 (`src/server/shared/SharedDefines.h:3471-3478`).
  Only `ALERT` (`AI/CreatureAI.cpp:228`) and `HOSTILE` have send sites.
  The area keeps any other code as `unknown`.
- A creature sends `HOSTILE` once for each new victim, when it switches
  its attack target (`Entities/Unit/Unit.cpp:7097-7117,7174`), not on every
  attack as the wow_messages and AzerothCore enum comments say.
- The pet form carries the pet's own guid, always `HOSTILE`, and goes to
  the owner only (`Entities/Unit/Unit.cpp:12578-12587`), when the owner
  orders an attack (`Handlers/PetHandler.cpp:260`). The area names the
  pet from the character's `UNIT_FIELD_SUMMON`, or else from the last pet
  command.
- `SMSG_BREAK_TARGET` is the packed guid of the unit, sent to every
  player in view except the unit (`Entities/Unit/Unit.cpp:15842-15847`).
  `SMSG_CLEAR_TARGET` is the full guid of the caster, sent only to players
  hostile to it (`Spells/SpellEffects.cpp:5019-5024`). The force-deselect
  effect sends both, `SMSG_BREAK_TARGET` first
  (`Spells/SpellEffects.cpp:5017`), so one cast gives two `target_broken`
  events; `hostileOnly` tells them apart.

## Left out

- The `ALERT` reaction is not seen live: it needs a stealthed player near
  a creature, and no preset has stealth.
- `SMSG_BREAK_TARGET` and `SMSG_CLEAR_TARGET` are not seen live: their
  sources are the force-deselect spell effect (spells such as Shadowmeld,
  Mirror Image and Killing Spree, `Spells/SpellEffects.cpp:5007-5017`) and
  a unit boarding a vehicle (`Entities/Vehicle/Vehicle.cpp:448`), and no
  preset or puppet verb can make them. The area tests build both from the AzerothCore writer.

## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_HIGHEST_THREAT_UPDATE` | `live` | probe flow `threat-fight` (`--expect` 0x482, 0x483, 0x485) on an `eversong10-hunter` moved to East Sanctum with `soap gm tele EastSanctum` (its spawn has no hostile creature within 35 yd), exit 0; three received, and the flow's target named the character and then the pet as its victim | `Combat/ThreatManager.cpp:880-898` |
| `SMSG_THREAT_UPDATE` | `live` | probe flow `threat-fight`, exit 0; three received, with the pet and the character on the list | `Combat/ThreatManager.cpp:880-898` |
| `SMSG_THREAT_REMOVE` | `live` | probe tap of the same `threat-fight` run, after the flow ended: when the character died, a second creature removed it from its list | `Combat/ThreatManager.cpp:872-878` |
| `SMSG_THREAT_CLEAR` | `live` | probe flow `threat-fight`, exit 0; received when the flow's target died | `Combat/ThreatManager.cpp:865-870` |
| `SMSG_AI_REACTION` | `live` | probe flow `threat-fight` (`--expect` 0x13C) on an `eversong10-hunter` moved to East Sanctum, exit 0; `HOSTILE` from each creature on each new victim, and one from the pet with its own guid just after the flow's pet attack order | `Entities/Creature/Creature.cpp:2477-2487` |
| `SMSG_BREAK_TARGET` | `mock` | `packages/core/src/wow/areas/threat/area.test.ts` "SMSG_BREAK_TARGET emits target_broken for the unit (Unit.cpp:15842-15847)"; not seen live | `Entities/Unit/Unit.cpp:15842-15847` |
| `SMSG_CLEAR_TARGET` | `mock` | `packages/core/src/wow/areas/threat/area.test.ts` "SMSG_CLEAR_TARGET emits target_broken for the caster (SpellEffects.cpp:5019-5024)"; not seen live | `Spells/SpellEffects.cpp:5019-5024` |
