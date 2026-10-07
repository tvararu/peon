# referral

The `referral` area offers and accepts refer-a-friend level grants. World
code reaches it through `session.areas.referral`.
`act.grantLevel(guid)` sends `CMSG_GRANT_LEVEL` and waits two seconds for
`SMSG_REFER_A_FRIEND_FAILURE`: it resolves `{ error: { error, reason, name } }`
on the failure and `"sent"` on silence. `act.acceptLevelGrant()` sends
`CMSG_ACCEPT_LEVEL_GRANT` with the proposer of the pending offer and clears
it, or returns `{ ok: false, reason: "no_offer" }` and sends nothing.

`SMSG_PROPOSE_LEVEL_GRANT` sets `pendingGrant { proposer, at }`, hidden from
`snapshot()` after 60 seconds, and emits `level_grant`. The failure packet
sets `failure` and emits `level_grant` with it.

## Wire notes

- `CMSG_GRANT_LEVEL` and `CMSG_ACCEPT_LEVEL_GRANT` are one packed guid
  (`Handlers/ReferAFriendHandler.cpp:27-28`,
  `Handlers/ReferAFriendHandler.cpp:70-71`).
- `SMSG_REFER_A_FRIEND_FAILURE` is a `u32` error, followed by the target's
  C string name only for error 9 (`NOT_IN_GROUP`)
  (`Handlers/ReferAFriendHandler.cpp:50-58`). The handler checks, in order: no
  target (8), no grantable levels (3), not the recruiter (1), other faction
  (5), target level too high (2), target at the recruit level cap (7), not
  grouped (9) (`Handlers/ReferAFriendHandler.cpp:35-48`).
- The error values are the `ReferAFriendError` enum in
  `Entities/Player/Player.h`.
- `SMSG_PROPOSE_LEVEL_GRANT` is the proposer's packed guid, sent to the
  target (`Handlers/ReferAFriendHandler.cpp:61-63`).
- `CMSG_ACCEPT_LEVEL_GRANT` returns at once without a recruiter link
  (`Handlers/ReferAFriendHandler.cpp:73-78`).

## Left out

- The offer itself (`SMSG_PROPOSE_LEVEL_GRANT`) needs an account with a
  recruiter link, the target's account id equal to that link, grantable
  levels and a shared group. No worker may set the link, so the offer is
  proven from the writer only.
- No verb: there is no agent-facing way to grant or accept.

## Capabilities row

No verb. A level grant needs a recruiter link in the auth database, which a
player cannot create.

## Proof

Live probes on two `eversong10` throwaway accounts
(`~/.local/state/peon-overnight/artifacts/597-wave7/guard/`): `referral-own/`
(flow `referral-grant`) and `referral-raw/` (raw sends).

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_GRANT_LEVEL` | `live` | grant at the visible partner got error 3 (`insufficient_grantable_levels`); a grant at an unknown guid got error 8 (`no_target`) | `Handlers/ReferAFriendHandler.cpp:23-59` |
| `SMSG_REFER_A_FRIEND_FAILURE` | `live` | bodies `03000000` and `08000000`; error 9 with a name is rig-tested | `Handlers/ReferAFriendHandler.cpp:50-58` |
| `CMSG_ACCEPT_LEVEL_GRANT` | `accepted` | raw send with the partner's packed guid: no reply, no disconnect, clean logout | `Handlers/ReferAFriendHandler.cpp:66-78` |
| `SMSG_PROPOSE_LEVEL_GRANT` | `rig` | packed guid from the writer; needs a recruiter link, not stageable | `Handlers/ReferAFriendHandler.cpp:61-63` |
