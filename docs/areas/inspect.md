# inspect

The `inspect` area asks the server about another player's gear, talents,
glyphs and achievements. World-service code calls it through
`session.areas.inspect.act`: `inspect(guid)` sends `CMSG_INSPECT` and
resolves with the parsed `SMSG_INSPECT_TALENT`, `inspectAchievements(guid)`
sends `CMSG_QUERY_INSPECT_ACHIEVEMENTS` and resolves with the parsed
`SMSG_RESPOND_INSPECT_ACHIEVEMENTS`. Both resolve `undefined` when the
server stays silent, which it does for an unknown guid, a target farther
than 28 yd, or an attackable target. The store keeps no state; each reply
emits a `talents` or `achievements` event carrying the parsed reply, and
the snapshot is `{}`.

## Wire notes

- `CMSG_INSPECT` is a raw `u64` guid, answered only for a player within
  28 yd that is not an attackable target; otherwise the server stays
  silent (`Handlers/MiscHandler.cpp:977-997`).
- `SMSG_INSPECT_TALENT` is a packed guid, then the talent block written by
  the inspect handler (`Handlers/MiscHandler.cpp:1014`, called from the
  `CMSG_INSPECT` handler at `Handlers/MiscHandler.cpp:1000-1016`): `u32`
  free points, `u8` spec count, `u8` active spec, and per spec `u8` talent
  count with (`u32` talent id, `u8` 0-based rank) pairs, then `u8` glyph
  count with `u16` glyph ids **inside** each spec. Spent points per spec
  are the sum of `rank + 1` over its talents, because the wire rank is
  0-based. wow_messages puts one glyph list after all specs
  (`SMSG_INSPECT_TALENT` in `Handlers/MiscHandler.cpp:1014`); AzerothCore
  wins.
- With `TalentsInspecting` off and a non-GM viewer the talent block of
  `SMSG_INSPECT_TALENT` is `u32 0, u8 0, u8 0`
  (`Handlers/MiscHandler.cpp:1003-1013`); the parser reads that as the
  short form, and the deployed realm has inspecting on, so the short form
  stays mock.
- The gear block of `SMSG_INSPECT_TALENT` is written by the same handler
  line (`Handlers/MiscHandler.cpp:1014`): a `u32` slot mask over the 19
  equipment slots, then per set bit the `u32` item entry, a `u16` enchant
  mask over the 12 enchantment slots, a `u16` per set enchant bit, the
  `int16` random property id, the packed creator guid and the `u32`
  suffix factor.
- `CMSG_QUERY_INSPECT_ACHIEVEMENTS` is a **packed** guid with the same
  range and attack checks (`Handlers/MiscHandler.cpp:1590-1612`).
- `SMSG_RESPOND_INSPECT_ACHIEVEMENTS` is a packed guid followed by the
  all-data body (`Achievements/AchievementMgr.cpp:2407-2413`), so its
  parser reuses `parseAchievementData`.

The talent block's shape comes from `Player::BuildPlayerTalentsInfoData`
(`Entities/Player/Player.cpp:14734-14765`): free points, the spec count
and active spec, then per spec the talent ids with 0-based ranks and the
six `u16` glyphs. The 28 yd limit is `INSPECT_DISTANCE`
(`Entities/Object/ObjectDefines.h:27`). The short form's trigger is the
`TalentsInspecting` config, default on (`World/WorldConfig.cpp:406`). The
gear block's shape comes from `Player::BuildEnchantmentsInfoData`
(`Entities/Player/Player.cpp:14851-14890`), whose enchant mask covers the
12 slots of `EnchantmentSlot` (`Entities/Item/Item.h:167-187`).

## Left out

None.

## Capabilities row

No agent verb; the probe flow calls the acts directly (`social-16`
replaces it).

## Proof
| `CMSG_INSPECT` | `live` | probe flow `inspect-partner`, exit 0; the reply follows | `Handlers/MiscHandler.cpp:977` |
| `SMSG_INSPECT_TALENT` | `live` | the same probe run, `outcome` `handled` | `Handlers/MiscHandler.cpp:1014` |
| `CMSG_QUERY_INSPECT_ACHIEVEMENTS` | `live` | probe flow `inspect-partner`, exit 0; the reply follows | `Handlers/MiscHandler.cpp:1590` |
| `SMSG_RESPOND_INSPECT_ACHIEVEMENTS` | `live` | the same probe run, `outcome` `handled` | `Achievements/AchievementMgr.cpp:2407` |
