# threat

The `threat` area keeps the threat list the server sends for each engaged
creature. World-service code reads it through
`session.areas.threat.state()`: one table per creature, with the current
victim, the entries sorted by threat with each entry's share of the top
entry, and the threat another unit needs to pull the creature
(`pullAt`). The area emits `table`, `victim_changed`, `removed` and
`cleared` events. A table goes away when the creature disappears or dies,
and every table goes away on a far teleport.

## Wire notes

AzerothCore and wow_messages agree on all four bodies
(`wow_message_parser/wowm/world/threat/smsg_threat_update.wowm`,
`wow_message_parser/wowm/world/threat/smsg_highest_threat_update.wowm`,
`wow_message_parser/wowm/world/threat/smsg_threat_remove.wowm`,
`wow_message_parser/wowm/world/threat/smsg_threat_clear.wowm`).

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

## Left out

- `SMSG_AI_REACTION`, `SMSG_BREAK_TARGET` and `SMSG_CLEAR_TARGET`: built
  by `threat-2`.

## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_HIGHEST_THREAT_UPDATE` | `live` | probe flow `threat-fight` (`--expect` 0x482, 0x483, 0x485) on an `eversong10-hunter` moved to East Sanctum with `soap gm tele EastSanctum` (its spawn has no hostile creature within 35 yd), exit 0; three received, and the flow's target named the character and then the pet as its victim | `Combat/ThreatManager.cpp:880-898` |
| `SMSG_THREAT_UPDATE` | `live` | probe flow `threat-fight`, exit 0; three received, with the pet and the character on the list | `Combat/ThreatManager.cpp:880-898` |
| `SMSG_THREAT_REMOVE` | `live` | probe tap of the same `threat-fight` run, after the flow ended: when the character died, a second creature removed it from its list | `Combat/ThreatManager.cpp:872-878` |
| `SMSG_THREAT_CLEAR` | `live` | probe flow `threat-fight`, exit 0; received when the flow's target died | `Combat/ThreatManager.cpp:865-870` |
