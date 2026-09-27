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
- `../WoWee`: a C++ 3.3.5a client, for reference.
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
cleanup (`remoteMotion.forget`, the combat and motion stores' `forget`,
and the control runtime's own entity-store subscription) still runs as
soon as the store removes the entity, before the packet can re-create
the GUID. Events raised outside
dispatch are delivered immediately.

## Session stores

`createSessionStores` (`packages/core/src/wow/session-stores.ts`) builds
the protocol state stores before any handler is registered, and
`registerWorldHandlers(conn, stores)` takes them as a required argument.
A handler parses its packet and writes a store: `CombatStore` (spellbook,
cooldowns, auras, casts, attacks, XP), `MotionStore` (observed unit
positions and splines), `RewardsStore` (loot window, item pushes,
inventory errors, rolls), `ItemTemplates` (item query cache),
`QuestStore` (dialog, quest log, queries, progress), `RecoveryStore`
(life, corpse, graveyard, resurrection offers), `VendorStore`,
`TrainerStore` and `DestroyStore` (window or offer, pending request,
settled outcome), `PlaceStore` (map, zone and area), `ActionBarStore`
(the 144 slots of `SMSG_ACTION_BUTTONS`: a 24-bit action id and an 8-bit
spell, item, macro or equipment-set type) and `SelfStore`
(login state and the current map, plus an event for every self-movement
packet: login verify, teleports, new world, roots, knockbacks, forced
speeds and self updates from `SMSG_UPDATE_OBJECT`). Login waits on
`SelfStore.waitLogin()`, not on a runtime, and the control runtime
receives self movement by subscribing to `SelfStore`. `WorldConn` holds
only transport and protocol state. A store sends no packet, except the
item query that `ItemTemplates` waits on, and runs no timer, except the
deadlines on those waits: `ItemTemplates` bounds its item query and
`SelfStore.waitLogin()` bounds the login wait. An actuator that sends
passes its `send` in; request timeouts live in the runtimes.
Each runtime (`CombatRuntime`, `RewardsRuntime`, `QuestRuntime` and so
on) takes the stores it reads, re-emits their events and holds the
policy: validating actions, sending requests, querying logged quests,
timing out unanswered requests and releasing an emptied loot window. For
each store event a runtime first arms, clears or retimes its request
timers, then publishes the event, then runs follow-up actions such as
the loot release; a listener that starts a request from the event keeps
its own timeout. Session cleanup disposes the runtimes, then the stores.

## Self movement

`ControlRuntime.drive(input, ms)` holds a movement input set: `move`
(forward or backward), `strafe` and `turn` (left or right). Applying a
new set sends one packet per changed axis, in that order, as the client
does on a key change: `MSG_MOVE_START_<axis>` on press, and
`MSG_MOVE_STOP`, `MSG_MOVE_STOP_STRAFE` or `MSG_MOVE_STOP_TURN` on
release. The same set again only re-arms the 1 ms–10 s lease, so a caller
holds keys by repeating them; lease expiry or `drive({})` releases every
axis. `move(direction, ms)` is the one-axis form. Dead reckoning moves at
the run speed (backward speed when backing up), along a 45° diagonal when
a strafe combines with forward or backward, and turns at the server's
turn rate (movement block, `SMSG_FORCE_TURN_RATE_CHANGE`; π rad/s by
default), so heartbeats carry the integrated orientation. `jump()` sends
`MSG_MOVE_JUMP` with `FALLING`, fall time 0 and the jump fields (z speed
−7.955547, the horizontal heading's cos and sin, and the horizontal
speed), then falling heartbeats with the elapsed fall time along the
ballistic arc (gravity 19.291105). `MSG_MOVE_FALL_LAND` goes out when the
descending arc meets the ground-oracle height under it, with the fall
time at that moment: 825 ms on level ground, later off a ledge, so the
server sees the real fall height. In the air the horizontal speed stays
fixed over gaps and steep or missing ground samples, and only a navmesh
collision stops it; turning continues, and a server position mid-air
cancels the jump.

## Entity fields

`extractObjectFields`, `extractUnitFields` and `extractGameObjectFields`
return `_changed: string[]`. Destructure it out on the create path; on the
values path, use it to pick the fields passed to `entityStore.update()`.

## Add an opcode

`protocol/opcodes.ts` (`GameOpcode`) and `protocol/update-fields.ts` (the
`*_FIELDS` tables for every object type) are generated from
`../wow_messages/intermediate_representation.json`, keeping the messages
valid for 3.3.5. Never edit them by hand: rerun
`mise protocol:tables [<ir.json>]`. The
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
5. Rewrite `docs/protocol-coverage.md` with `mise protocol:coverage`.
6. Prove it on the live server ([testing.md](testing.md#live-characters)).

[protocol-coverage.md](protocol-coverage.md) lists every `GameOpcode`
with its direction and status. `handled`: the world handlers register a
real handler for it, or core source outside the opcode table and
`STUBS` names it (a sent client opcode, an awaited reply). `stub`: it is
in `STUBS`. `missing`: neither.

`OpcodeDispatch` counts every inbound opcode that has neither a handler
nor a waiter (`unhandledCounts()`) and never throws for one. It reports
each such opcode once as a `not_implemented` notice labelled with its
`GameOpcode` name. A notice made while no one subscribes, such as one
during login, waits in `conn.pendingNotices` (up to 64), and the first
`onNotice` subscriber gets them with their original `at`. When the
backlog is full, the report is retried on the opcode's next packet. The
harness game log shows these notices as `notice/not_implemented`.

## Packet trace

`ClientConfig.trace` takes a `TraceSink` (`packet-trace.ts`, exported
from `@peon/core/session`). The session calls `row` once per packet:
`in` for each drained packet with its `outcome` (`handled`, `unhandled`
or `error`), `out` for each `sendPacket`, and one `in` row per inner
`SMSG_COMPRESSED_MOVES` packet with `via: "compressed"` (`skipped` for
an opcode the handler drops). `size` is the body length. `body` is hex
and present only when `bodies` is true; `CMSG_AUTH_SESSION` never has
one. After login the session calls `attach` with a sender for raw
packets, and when the socket closes (logout, `close` or a dropped
connection) it calls `close` with `PacketCounts`: `seen` and `unhandled`
from `OpcodeDispatch.counts()`, and `sent`, keyed by `GameOpcode` name
(`opcodeName`).

## Check citations

`mise protocol:cite-check [path...]` checks the AzerothCore `path:line`
citations in the area notes (`docs/areas/*.md`), or in the files it is
given; `-` reads stdin, so a PR body can be piped from
`gh pr view <N> --json body -q .body`. It reads the checkout named by
`PEON_AZEROTHCORE_DIR`, or `~/code/azerothcore-wotlk-playerbots`; keep
it on the `deployed` branch, which the checker does not verify. It is
not part of `mise ci`, because a CI host may lack the checkout.

A citation is a `.cpp`, `.cc`, `.h`, `.hpp` or `.inl` path followed by
`:<line>`, `:<from>-<to>` or a comma list of those. The path may be any
suffix of the checkout path that names exactly one file. A citation
binds to every opcode named in its paragraph, list item or table row.
For each cited line the checker takes a scope:

- inside a function, the outermost enclosing function;
- inside a class but no function, such as a header member, the
  innermost enclosing class;
- outside any function or type, the line itself;
- inside the opcode table (`OpcodeTable::Initialize`, `enum Opcodes`),
  the line itself, because the table names every opcode.

Every distinct scope of a range or comma list must name a bound opcode.

| Verdict | Meaning |
|---|---|
| `ok` | the file and lines exist, and each scope names a bound opcode, its `WorldSession` handler from `Opcodes.cpp` or its `WorldPackets` class |
| `unbound` | no opcode in the block; only the file and lines are checked |
| `missing` | no file in the checkout ends with the path |
| `ambiguous` | more than one file ends with the path |
| `out_of_range` | a line is past the end of the file |
| `mismatch` | a scope names none of the bound opcodes; the detail gives its first cited line |

The last four fail the command. A helper that writes part of a body but
does not name the opcode, such as `ByteBuffer::AppendPackedTime`, gets
`mismatch` in a block that names the opcode.
