# trade

The `trade` area lets the character take part in a full trade with another
player. World-service code reads it through `session.areas.trade.state()`:
`phase` (`idle`, `requested_out`, `requested_in`, `open`, `closed` or
`settling`), `with`, `from`, the offers (`ownOffer`, `theirOffer` with gold
and a version that rises on every change), `selfAccepted`, `theyAccepted`,
`lastOutcome` and `dropped` (stray statuses while `idle`, or any
non-`TRADE_CANCELED` status while `settling`). The area emits `requested`,
`opened`, `canceled`, `refused`, `unanswered`, `offer_changed`,
`back_to_trade`, `they_accepted` and `completed`.

The acts:

- `requestTrade(guid)` sends `CMSG_INITIATE_TRADE`. It throws unless the
  phase is `idle` or `closed`, and refuses `busy` without sending while
  `settling`. It settles `ok` when the window opens, `refused` with the
  server's status name (`no_target`, `target_to_far`, `wrong_faction`,
  `you_dead`, `you_stunned`, `you_logout`, `target_dead`,
  `target_stunned`, `target_logout`, `trial_account`, and `busy` or
  `ignore_you` from the partner), `superseded` when an incoming
  `BEGIN_TRADE` arrives while the request is out, and `unanswered` after
  60 seconds, when it enters `settling` and sends `CMSG_CANCEL_TRADE` to
  free the character; settling ends on `TRADE_CANCELED` or after 5 s. A
  cancel that already settled the request skips that timeout send, so only
  one `CMSG_CANCEL_TRADE` goes out. A silent initiate veto leaves no
  `CMSG_INITIATE_TRADE` reply (`Handlers/TradeHandler.cpp:841-842`):
  `TradeCancel` with no `m_trade` takes the empty branch, so the store is
  already `settling` and a later stray `TRADE_CANCELED` ends it. A cancel send that throws at the timeout
  settles the store back to `idle` and rejects with the send error, so the
  next `requestTrade` may start.
  Any cancel status during `requested_out`, `requested_in` or `open`
  applies to that current trade. `BEGIN_TRADE` always starts a fresh
  incoming request. `trade_canceled` before the window opens settles a
  request `refused`, while `cancelTrade` settles it `ok`.
- `answerTrade("yes" | "busy" | "ignore")` answers a request in
  `requested_in` with `CMSG_BEGIN_TRADE`, `CMSG_BUSY_TRADE` or
  `CMSG_IGNORE_TRADE`. It throws `no_request` in any other phase.
- `offerItem(tradeSlot, bag, slot)` sends `CMSG_SET_TRADE_ITEM` and records
  the own slot from `readInventory`. It throws for trade slot 6 or above
  (`TRADE_SLOT_TRADED_COUNT` is 6 in `Entities/Player/TradeData.h`), an
  empty bag position, an equipped position (bag 255, slots 0-18) or an item
  already in another trade slot (`Handlers/TradeHandler.cpp:905-911`).
- `withdrawItem(tradeSlot)` sends `CMSG_CLEAR_TRADE_ITEM`
  (`Handlers/TradeHandler.cpp:935-947`) and clears the own slot.
- `offerGold(copper)` throws above the coinage, else sends
  `CMSG_SET_TRADE_GOLD` (`Handlers/TradeHandler.cpp:858-868`).
- `acceptTrade(expectVersion)` throws `offer_changed` and sends nothing
  when `theirOffer.version` differs from the seen version; otherwise it
  sends `CMSG_ACCEPT_TRADE` (`Handlers/TradeHandler.cpp:237`), settles
  `ok` with the outcome on `completed`, `refused` on `CLOSE_WINDOW`, and
  `waiting_for_them` after 60 s with the trade left open.
- `unacceptTrade()` sends `CMSG_UNACCEPT_TRADE`
  (`Handlers/TradeHandler.cpp:683-690`) only when `selfAccepted`.
- `cancelTrade()` sends `CMSG_CANCEL_TRADE` and enters `settling`. The
  reply settles it `ok`; no reply within 5 s settles it `unanswered`
  locally back to `idle`.

A request nobody answers within 60 seconds is answered busy, so the
character can trade again.

## Wire notes

- `CMSG_INITIATE_TRADE` is one flat `uint64` guid, read with
  `recvPacket >> ID` (`Handlers/TradeHandler.cpp:723`); the stream
  operator reads a plain `uint64`, not a packed guid (see the
  `ObjectGuid` operators in `Entities/Object/ObjectGuid.cpp`).
- `CMSG_BEGIN_TRADE`, `CMSG_BUSY_TRADE`, `CMSG_IGNORE_TRADE` and
  `CMSG_CANCEL_TRADE` have empty bodies
  (`Handlers/TradeHandler.cpp:692-702`, `:69-72`, `:64-67`, `:714-719`).
- `SMSG_TRADE_STATUS` is a `uint32` status, then a body only for some
  statuses (`Handlers/TradeHandler.cpp:35-60`): `BEGIN_TRADE` (1) the
  initiator's `uint64` guid; `OPEN_WINDOW` (2) a `uint32` trade id, always
  0; `CLOSE_WINDOW` (12) a `uint32` inventory result, a `uint8` target
  flag and a `uint32` limit item; `WRONG_REALM` (22) and `NOT_ON_TAPLIST`
  (23) a `uint8` slot. Every other status is the bare 4 bytes. The status
  names come from the `TradeStatus` enum of `SharedDefines.h`; 22 is
  `wrong_realm` (wow_messages calls it `ONLY_CONJURED`, same wire), and
  an unknown value gets a fallback name.
- The initiate checks run in this order: self dead, stunned, logging out,
  in flight, level, trial account, target missing (`NO_TARGET`), self or
  target already trading (`BUSY`), target dead, in flight, stunned,
  logging out, trial, other faction (`WRONG_FACTION`), farther than
  `TRADE_DISTANCE` (`TARGET_TO_FAR`)
  (`Handlers/TradeHandler.cpp:726-840`). The faction check runs before
  the distance check.
- The server creates the trade data on both characters at the initiate
  and sends `BEGIN_TRADE` to the target only
  (`Handlers/TradeHandler.cpp:845-855`). The initiator hears nothing until
  the other side answers. A refusal at the initiate (`NO_TARGET`,
  `TARGET_TO_FAR`, `WRONG_FACTION` and the rest) creates no trade data, so
  the area returns to `idle` and the next `requestTrade` may start.
- A `CMSG_BUSY_TRADE` or `CMSG_IGNORE_TRADE` reply reaches both sides
  (`BUSY` 0 or `IGNORE_YOU` 14), and a cancel after the window opened
  sends `TRADE_CANCELED` (3) to both.
- `CMSG_ACCEPT_TRADE` reads no body, so the sent `uint32 1` (the
  wow_messages `trade/cmsg_accept_trade.wowm` form) is ignored by
  AzerothCore (`Handlers/TradeHandler.cpp:237`).
- `SMSG_TRADE_STATUS_EXTENDED` is `u8` side, `u32` trade id, two `u32`
  slot counts (both 7), `u32` gold, `u32` spell, then 7 slots of `u8`
  index and 18 words each; an entry of 0 is an empty slot
  (`Handlers/TradeHandler.cpp:89-102`). The server echoes the own side
  only when a spell is set, so side 0 is kept as `ownEcho` and never
  replaces `ownOffer`.
- `CMSG_SET_TRADE_ITEM` is `u8, u8, u8` (trade slot, bag, slot;
  `Handlers/TradeHandler.cpp:877-879`); `CMSG_CLEAR_TRADE_ITEM` one `u8`
  (`Handlers/TradeHandler.cpp:935-947`); `CMSG_SET_TRADE_GOLD` one `u32`
  (`Handlers/TradeHandler.cpp:858-868`); `CMSG_UNACCEPT_TRADE` empty
  (`Handlers/TradeHandler.cpp:683-690`). The offer send order observed
  live: the other side's `SMSG_TRADE_STATUS_EXTENDED` arrives before the
  `BACK_TO_TRADE` accept reset.

## Left out

- `NOT_ON_TAPLIST` (23) needs a soulbound looted item in a trade; it stays
  a rig test built from `TradeHandler.cpp:924-929`.
- `TRIAL_ACCOUNT`, `YOU_DEAD` and the stunned, logout and flight statuses
  are tested on the rig only; the realm's trial restriction is unknown
  and the staging for the others is not worth a live try.
- A `TRADE_CANCELED` that arrives for one side's already-cleared trade
  while the other side's cancel is still in flight (both sides cancel at
  once) closes the local `settling` early; the outcome is the same
  (`idle`) either way. `Player::TradeCancel` deletes both sides' trade
  data and notifies both sessions (`PlayerStorage.cpp:4223-4241`).

## Capabilities row

Capabilities rows: give items and gold, take a trade offered, swap items, and refuse or cancel a trade, proven by `t9-trade-give`, `t9-trade-receive`, `t9-trade-swap` and `t9-trade-cancel` (see [capabilities.md](../capabilities.md)).

## Proof

Live proof on `eversong10` accounts at one point (both at the spawn, 0
yards apart), one driven by `protocol:probe --flow trade-window --arg
answer=...`, the other by `--arg target=<guid>`, `--bodies` traces. The
`wrong_faction` row used an `elwynn1` character moved to the Eversong
spawn with `soap setup position`. The probe runs are not committed; each
run's trace shows the status body named below.

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_TRADE_STATUS` | `live` | every answer: `BEGIN_TRADE` (`01000000` + guid), `OPEN_WINDOW` (`0200000000000000`), `TRADE_CANCELED` (`03000000`), `BUSY` (`00000000`), `IGNORE_YOU` (`0e000000`), `NO_TARGET` (`06000000`), `TARGET_TO_FAR` (`0a000000`), `WRONG_FACTION` (`0b000000`) in the uncommitted probe runs | `Handlers/TradeHandler.cpp:35-60` |
| `CMSG_INITIATE_TRADE` | `live` | 8-byte flat guid send in every run (the `answer=yes` run with a partner target); the reply is the status above, and a self target answers `BUSY` | `Handlers/TradeHandler.cpp:721-724` |
| `CMSG_BEGIN_TRADE` | `live` | `answer=yes` run: empty send, `OPEN_WINDOW` on both sides | `Handlers/TradeHandler.cpp:692-702` |
| `CMSG_BUSY_TRADE` | `live` | `answer=busy` run: empty send, `BUSY` on both sides | `Handlers/TradeHandler.cpp:69-72` |
| `CMSG_IGNORE_TRADE` | `live` | `answer=ignore` run: empty send, `IGNORE_YOU` on both sides | `Handlers/TradeHandler.cpp:64-67` |
| `CMSG_CANCEL_TRADE` | `live` | the cancel after `OPEN_WINDOW` (the `answer=yes` run): `TRADE_CANCELED` on both sides | `Handlers/TradeHandler.cpp:714-719` |
| `SMSG_TRADE_STATUS_EXTENDED` | `live` | B's item, gold and withdraw offers: A's trace shows a 532-byte `EXTENDED` after each change, and A's state emits `offer_changed` then `back_to_trade` (not committed puppet traces, kept until review) | `Handlers/TradeHandler.cpp:89-102` |
| `CMSG_SET_TRADE_ITEM` | `live` | B's offer of Linen Cloth slot 28 into trade slot 0 (4-byte send); A's trace shows the `EXTENDED` | `Handlers/TradeHandler.cpp:877-879` |
| `CMSG_CLEAR_TRADE_ITEM` | `live` | B's withdraw of trade slot 0 (1-byte send); A gets `EXTENDED` plus `back_to_trade` | `Handlers/TradeHandler.cpp:935-947` |
| `CMSG_SET_TRADE_GOLD` | `live` | B's 10-copper offer (4-byte send); A's `EXTENDED` shows it; a 999999-copper offer is refused with `CLOSE_WINDOW` | `Handlers/TradeHandler.cpp:858-868` |
| `CMSG_ACCEPT_TRADE` | `live` | B accepts (A gets `they_accepted`), A accepts (`completed` both sides); truth deltas: A 1000→1010 copper and 3 cloth, B 1000→990 and 2 cloth stacks left | `Handlers/TradeHandler.cpp:237` |
| `CMSG_UNACCEPT_TRADE` | `live` | B accepts then unaccepts (empty send); A gets `back_to_trade` | `Handlers/TradeHandler.cpp:683-690` |
