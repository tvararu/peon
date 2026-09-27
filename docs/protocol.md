# Protocol

Notes for work on `packages/core/src/wow`, the WoW 3.3.5a (build 12340)
client.

## Reference codebases

Sibling checkouts next to this repository:

- `../wow-chat-client`: Node.js WoW chat client, the primary protocol
  reference.
- `../azerothcore-wotlk-playerbots`: the AzerothCore server (C++). Key
  files: `src/server/game/Entities/Object/Updates/UpdateFields.h` (every
  update field index), `src/server/game/Handlers/SpellHandler.cpp`
  (`CMSG_CAST_SPELL`), `src/server/game/Handlers/GroupHandler.cpp`
  (`SMSG_PARTY_MEMBER_STATS`).
- `../wow_messages`: machine-readable `.wowm` definitions of every opcode;
  world packets are in `wow_message_parser/wowm/world/`.
- `../wowser`: browser client (ES2015). Useful for opcodes
  (`../wowser/src/lib/game/opcode.js`), auth error codes
  (`../wowser/src/lib/auth/`) and realm-list parsing
  (`../wowser/src/lib/realms/handler.js`). Its SRP uses `Math.random`;
  ours does not.
- `../namigator` and `../namigator-rs`: pathfinding and line of sight from
  the game's MPQ files, and its Rust bindings (a clean API reference for
  `find_path`, `line_of_sight`, `find_height`, `load_adt`).

wowdev.wiki blocks automated access and has no offline dump; the sources
above cover protocol work.

## Gotchas

- Parsers read packets inside object literals, which evaluate in key order
  (`{ guid: r.packedGuidBig(), counter: r.uint32LE() }`). Never sort or
  reorder such keys; `useSortedKeys` is off for `packages/core/src/wow/**`.
- Server message lengths include the null terminator: strip the trailing
  `\0` when decoding.
- `drainWorldPackets` must catch handler errors, because one bad packet
  otherwise breaks every packet after it.
- Chat must use the race's language (`LANG_ORCISH=1` for Horde,
  `LANG_COMMON=7` for Alliance). The server drops `LANG_UNIVERSAL` (0)
  silently.
- Validate new behaviour against the real server first, then encode it in
  mock integration tests as a living spec.

## WorldHandle events

`WorldHandle` `on*` hooks are multi-subscriber: each returns an unsubscribe
function, and all are backed by `conn.events`
(`packages/core/src/wow/world-events.ts`, built on `#lib/emitter`). Emit
with `conn.events.<name>.emit(...)`, never a setter. A listener that throws
during packet dispatch is reported through `onPacketError` with the
opcode; elsewhere the error is rethrown once delivery finishes.

`cleanupSession` clears `conn.events` before socket teardown, because
`entityStore.clear()` in the close handler fires a disappear for every
entity and subscribers must be detached first.

## Entity fields

`extractObjectFields`, `extractUnitFields` and `extractGameObjectFields`
return `_changed: string[]`. Destructure it out on the create path; on the
values path, use it to pick the fields passed to `entityStore.update()`.
