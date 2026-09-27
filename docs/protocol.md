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
opcode; elsewhere the error is rethrown once delivery finishes. An error
thrown by an `onPacketError` listener is dropped, so it never stops packet
draining.

`OpcodeDispatch.handle` runs the opcode's registered handler first, then
resolves the oldest `expect` waiter whose `match` accepts the packet. Each
waiter gets its own reader at the start of the body, and a timeout removes
only its own waiter. A flow that awaits a reply reads state the handler
already applied; it never reruns the handler. A `match` that throws counts
as a non-match. When the handler throws, the waiter the packet matches, or
the oldest waiter if a `match` could not read the body, is rejected with
the handler's error instead.

`cleanupSession` clears `conn.events` before socket teardown, because
`entityStore.clear()` in the close handler fires a disappear for every
entity and subscribers must be detached first.

## Entity views and events

`EntityStore` getters, entity events and nearby rows hand out the stored
objects as read-only views: the types are deeply readonly and nothing is
copied. Only the store writes an entity, through `create`, `update` (which
merges raw update fields), `setName`, `setPosition`, `destroy` and
`clear`. A view reflects later packets, so a consumer that keeps entity
data across an `await`, a timer or another event stores
`snapshotEntityEvent(event)`, a detached copy.

`disappear` fires only after the entity has left every store index, so
`get` and `all` no longer return it. A create over an existing GUID
removes the old entity, fires its `disappear`, then inserts the new one
and fires `appear`. `clear` removes everything before it fires any
`disappear`.

Entity events raised while a packet is dispatched are queued and delivered
in order after that packet's handler returns, so listeners see the
packet's combat, control and movement state already applied. Per-GUID
cleanup (`remoteMotion.forget`, `combat.forget`,
`control.observeDisappear`) still runs as soon as the store removes the
entity, before the packet can re-create the GUID. Events raised outside
dispatch are delivered immediately.

## Entity fields

`extractObjectFields`, `extractUnitFields` and `extractGameObjectFields`
return `_changed: string[]`. Destructure it out on the create path; on the
values path, use it to pick the fields passed to `entityStore.update()`.

## Add an opcode

`protocol/opcodes.ts` (`GameOpcode`) and `protocol/update-fields.ts` (the
`*_FIELDS` tables for every object type) are generated from
`../wow_messages/intermediate_representation.json`, keeping the messages
valid for 3.3.5. Never edit them by hand: rerun
`bun packages/devtools/src/protocol-tables.ts [<ir.json>]`. The
generator's `RENAMED`, `CORE_OPCODES` and `CORE_FIELDS` tables keep the
core names that differ from wow_messages or that it lacks, and the tests
fail if a name core already used loses its number or offset.
Hand-written wire enums live in `protocol/enums.ts` and
`protocol/entity-fields.ts`.

1. Parse the body in `protocol/<domain>.ts` from a `PacketReader`, with a
   colocated test built from a captured or reference packet. Parsers pick
   the update fields they read; the generated tables only name them.
2. Register one handler with `conn.dispatch.on` in the domain's
   `register*Handlers` function. A second handler for an opcode throws, so
   compose in the owner. A flow that awaits a reply uses
   `conn.dispatch.expect` and reads the state the handler applied.
3. Drop the opcode from `STUBS` in `protocol/stubs.ts` if it is listed
   there.
4. Send a client opcode with `sendPacket` and a `PacketWriter` body.
5. Rewrite `docs/protocol-coverage.md` with
   `bun packages/core/test-support/protocol-coverage.ts`.
6. Prove it on the live server ([testing.md](testing.md#live-characters)).

[protocol-coverage.md](protocol-coverage.md) lists every `GameOpcode`
with its direction and status. `handled`: the world handlers register a
real handler for it, or core source outside the opcode table and
`STUBS` names it (a sent client opcode, an awaited reply). `stub`: it is
in `STUBS`. `missing`: neither.

`OpcodeDispatch` counts every inbound opcode that has neither a handler
nor a waiter (`unhandledCounts()`) and never throws for one. It reports
each such opcode once as a `not_implemented` notice labelled with its
`GameOpcode` name. A report made while no notice subscriber exists, such
as one during login, is retried on the next unhandled packet. The harness
game log shows these notices as `notice/not_implemented`.
