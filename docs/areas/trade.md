# trade

The `trade` area lets the character take part in the request half of a
trade with another player. World-service code reads it through
`session.areas.trade.state()`: `phase` (`idle`, `requested_out`,
`requested_in`, `open` or `closed`), `with`, `from`, the offers
(`ownOffer`, `theirOffer`, empty until the offer opcodes land),
`selfAccepted`, `theyAccepted` and `lastOutcome`. The area emits
`requested`, `opened`, `canceled`, `refused` and `unanswered`.

The acts:

- `requestTrade(guid)` sends `CMSG_INITIATE_TRADE`. It throws unless the
  phase is `idle` or `closed`, settles `ok` when the window opens,
  `refused` with the server's status name (`no_target`,
  `target_to_far`, `wrong_faction`, `you_dead`, `you_stunned`,
  `you_logout`, `target_dead`, `target_stunned`, `target_logout`,
  `trial_account`, and `busy` or `ignore_you` from the partner) and
  `unanswered` after 60 seconds, when it clears the pending request and
  sends `CMSG_CANCEL_TRADE` to free the character. A late cancel reply
  after that timeout is ignored. `trade_canceled` before the window
  opens settles a request `refused`, while `cancelTrade` settles it
  `ok`.
- `answerTrade("yes" | "busy" | "ignore")` answers a request in
  `requested_in` with `CMSG_BEGIN_TRADE`, `CMSG_BUSY_TRADE` or
  `CMSG_IGNORE_TRADE`. It throws `no_request` in any other phase.
- `cancelTrade()` sends `CMSG_CANCEL_TRADE`.

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
- `CMSG_ACCEPT_TRADE` reads no body, so economy-4's `uint32` is ignored
  by AzerothCore.

## Left out

- Offers, gold, accept and `SMSG_TRADE_STATUS_EXTENDED` belong to
  economy-4; its stub line stays in `opcodes.ts`.
- `TRIAL_ACCOUNT`, `YOU_DEAD` and the stunned, logout and flight statuses
  are tested on the rig only; the realm's trial restriction is unknown
  and the staging for the others is not worth a live try.

## Capabilities row

Capabilities row: proposed in economy-5.

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
