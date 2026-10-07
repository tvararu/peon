# charters

The `charters` area lists a petitioner's charters, buys a guild charter, reads its petition, shows its signatures, renames it, offers a charter to another player for signing, signs an offered charter, declines an offer and turns a signed charter in. World-service code reads it through `session.areas.charters.state()`: `offers` (the charter entries of the last `SMSG_PETITION_SHOWLIST` per NPC guid), `petitions` (the petitions read by `SMSG_PETITION_QUERY_RESPONSE`, keyed by charter item guid), `pendingOffer` (a shown charter the character does not carry, for example an offered signing copy), `pending` and `lastOutcome`. The area emits `showlist` on every charter list, `query` when a petition arrives for a known charter, `signatures` on every signature list, `renamed` on every rename echo, `bought` when the bought charter reaches the bags, `refused` on any refusal and `unanswered` after 5 seconds of silence.

- `showList(npc)` sends `CMSG_PETITION_SHOWLIST` and settles `ok` on the matching `SMSG_PETITION_SHOWLIST`. Out of range sends nothing back, so the act settles `unanswered`.
- `buy(npc, name, index)` sends `CMSG_PETITION_BUY` and settles `ok` with the new charter's item guid when the peeked `SMSG_ITEM_PUSH_RESULT` for a charter entry reaches the bags. A non-petitioner NPC refuses locally as `not_petitioner` and a character already in a guild refuses locally as `in_guild` when the entity store shows it. A taken name refuses as `name_taken`, an invalid name as `name_invalid` (both peeked `SMSG_GUILD_COMMAND_RESULT` command 0), no money refuses as `not_enough_money` (peeked `SMSG_BUY_FAILED`), and a full bag refuses with the inventory reason (peeked `SMSG_INVENTORY_CHANGE_FAILURE`, except result 59). Anything else silent settles `unanswered`.
- `query(item)` sends `CMSG_PETITION_QUERY` with the petition id read from the charter's `ITEM_FIELD_ENCHANTMENT_1_1`, or 0 when the entity store has none, and settles `ok` on `SMSG_PETITION_QUERY_RESPONSE`. A response for an unknown petition stores nothing.
- `showSignatures(item)` sends `CMSG_PETITION_SHOW_SIGNATURES` and settles `ok` on `SMSG_PETITION_SHOW_SIGNATURES`. A shown charter the character does not carry is kept as `pendingOffer` and reported with `offered: true`.
- `rename(item, name)` sends `MSG_PETITION_RENAME` and settles `ok` on the rename echo, or `refused` on the command result.
- `offer(item, target)` sends `CMSG_OFFER_PETITION` and settles `ok` with the target as `offered` on the matching `SMSG_PETITION_SHOW_SIGNATURES` to the target, or `no_reply` when the server stays silent. A charter the character does not carry refuses locally as `not_held`.
- `sign(item)` sends `CMSG_PETITION_SIGN` and settles `ok` on `SMSG_PETITION_SIGN_RESULTS` with code 0. With no `pendingOffer` for the item the act refuses locally as `no_offer`.
- `decline(item)` sends `MSG_PETITION_DECLINE` and clears the `pendingOffer`, returning `ok`; with no offer for the item it returns `no_offer` without sending.
- `turnIn(item)` sends `CMSG_TURN_IN_PETITION` (with the five `uint32` emblem values for an arena charter) and settles `ok` when `SMSG_TURN_IN_PETITION_RESULTS` carries code 0, or `refused` with `need_more_signatures` for code 4 (and the other codes). A charter the character does not carry refuses locally as `not_held`.

Each act settles as `ok`, `refused` with the server's reason, or `unanswered` after 5 seconds of silence.

## Wire notes

- `CMSG_PETITION_SHOWLIST` is one `uint64` NPC guid; out of range the server answers nothing (`Handlers/PetitionsHandler.cpp:838-846`).
- `SMSG_PETITION_SHOWLIST` is the NPC guid, a `uint8` count, then one entry of six `uint32` (index, item entry, display id, cost, slot type, signatures needed) (`Handlers/PetitionsHandler.cpp:848-925`). A guild petitioner (tabard designer) offers one entry; an arena organizer offers three entries needing 2, 3 and 5 signatures.

The guild entry is item 5863, display 16161 (`Petitions/PetitionMgr.h:26-35`). The costs are 1000 for a guild charter and 800000, 1200000, 2000000 for arena charters; the guild signature minimum defaults to 9 (`World/WorldConfig.cpp:218-221,279`).
- `CMSG_PETITION_BUY` is the NPC guid, fixed zeros and empty strings, the name, then the charter index (1 guild, arena slot + 1) (`Handlers/PetitionsHandler.cpp:32-61`). Silent when the NPC is missing, out of range, lacks the petitioner flag, or the character is already in a guild (`Handlers/PetitionsHandler.cpp:66-84`). A taken name answers command 0 result 7, an invalid name result 6 (`Handlers/PetitionsHandler.cpp:139-149`), no money answers `SMSG_BUY_FAILED` (`Handlers/PetitionsHandler.cpp:172-175`), and success sends the charter with `SendNewItem` (`Handlers/PetitionsHandler.cpp:198`).
- `CMSG_PETITION_QUERY` is a `uint32` id and the charter guid; the server ignores the id (`Handlers/PetitionsHandler.cpp:275-286`). `SMSG_PETITION_QUERY_RESPONSE` starts with the 31-bit petition id (`Handlers/PetitionsHandler.cpp:288-333`), which the area stores in the charter's `ITEM_FIELD_ENCHANTMENT_1_1` reading and sends back on the next query.
- `CMSG_PETITION_SHOW_SIGNATURES` is the charter guid with no owner or range check (`Handlers/PetitionsHandler.cpp:236-246`). `SMSG_PETITION_SHOW_SIGNATURES` is the petition guid, the requester guid (not the owner), the petition id, a `uint8` count and one guid plus `uint32` 0 per signer (`Handlers/PetitionsHandler.cpp:259-272`).
- `MSG_PETITION_RENAME` is the charter guid and the new name; the item must be in the caller's bags and the reply echoes both (`Handlers/PetitionsHandler.cpp:335-397`).
- `CMSG_OFFER_PETITION` is a `uint32` junk, the charter guid and the target player guid; the server answers the target (not the offerer) with `SMSG_PETITION_SHOW_SIGNATURES` carrying the petition guid, the owner guid, the petition id and the signer list (`Handlers/PetitionsHandler.cpp:568-657`). The offerer hears nothing back, so the act settles `no_reply`.
- `CMSG_PETITION_SIGN` is the charter guid and one `uint8`; the server writes the signature row and answers the signer (and the owner, when online) with `SMSG_PETITION_SIGN_RESULTS` of petition guid, signer guid and code 0 for a first signature (`Handlers/PetitionsHandler.cpp:523-544`).
- `SMSG_PETITION_SIGN_RESULTS` is the petition guid, the signer guid and a `uint32` code: 0 first signature, 1 already signed; 2 already in a guild, 3 cannot sign its own, 4 not the right server (`Handlers/PetitionsHandler.cpp:501-511,529-544`).
- `MSG_PETITION_DECLINE` is the charter guid; the server reads only the petition guid and forwards the signer's guid to the petition's owner when the owner is online (`Handlers/PetitionsHandler.cpp:547-566`). The read owner guid is never assigned, so it stays empty and the lookup never finds the owner: the server form never reaches anyone. The writer builds the 8-byte signer guid (`Handlers/PetitionsHandler.cpp:562-564`).
- `CMSG_TURN_IN_PETITION` is the charter guid, plus five `uint32` emblem values for an arena charter (`Handlers/PetitionsHandler.cpp:659-679`). With fewer signatures than the charter type needs (guild: `MinPetitionSigns`; arena: type minus 1) the server answers `SMSG_TURN_IN_PETITION_RESULTS` code 4 (`Handlers/PetitionsHandler.cpp:753-758`); a full charter answers code 0 and creates the guild or arena team (`Handlers/PetitionsHandler.cpp:833-835`).
- `CMSG_PETITION_BUY` is also how a character replaces a charter: buying again deletes the previous petition row first, so one charter per account at a time (`Handlers/PetitionsHandler.cpp:205-222`).
- `SMSG_ITEM_PUSH_RESULT`, `SMSG_BUY_FAILED`, `SMSG_GUILD_COMMAND_RESULT` and `SMSG_INVENTORY_CHANGE_FAILURE` are owned by the legacy handlers; the area peeks them and leaves their owners in place. No money is reported through `Player::SendBuyError` (`Entities/Player/PlayerStorage.cpp:4199-4208`), and a bought charter reaches the bags through `Player::SendNewItem`.

## Left out

- Nothing: every opcode the area owns is handled, dead or unseen.

## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_PETITION_SHOWLIST` | `live` | `charters-buy --arg name=FacFgklphhpapc` on guildless `max80` `Fgklphhpapc` (account `FAC6ABF77F0F2`, deleted): the trace shows the 8-byte NPC guid `b41e0066700030f1` out and `SMSG_PETITION_SHOWLIST` in; the act settles `ok` (artifact `wave5/probe-charters-live`) | `Handlers/PetitionsHandler.cpp:838-846` |
| `SMSG_PETITION_SHOWLIST` | `live` | the same run: one guild entry `(1, 5863, 16161, 1000, 0, 9)`; the arena run at the organizer shows three entries `(1, 23560, 16161, 800000, 2, 2)`, `(2, 23561, 16161, 1200000, 3, 3)`, `(3, 23562, 16161, 2000000, 5, 5)` (artifacts `wave5/probe-charters-live`, `wave5/probe-charters-arena`) | `Handlers/PetitionsHandler.cpp:848-925` |
| `CMSG_PETITION_BUY` | `live` | the same run buys index 1 as `FacFgklphhpapc`; the trace shows the full buy body and `SMSG_ITEM_PUSH_RESULT` follows with the charter in slot 29 | `Handlers/PetitionsHandler.cpp:32-61` |
| `CMSG_PETITION_QUERY` | `live` | the same run queries the bought charter `0x400000000014ca86` with petition id 1 | `Handlers/PetitionsHandler.cpp:275-286` |
| `SMSG_PETITION_QUERY_RESPONSE` | `live` | the same run: the 88-byte response stores the petition by item guid with owner `0x135c`, `min = max = 9`, type 0; the act settles `ok` | `Handlers/PetitionsHandler.cpp:288-333` |
| `CMSG_PETITION_SHOW_SIGNATURES` | `live` | the same run shows the bought charter's signatures (0 signers) | `Handlers/PetitionsHandler.cpp:236-246` |
| `SMSG_PETITION_SHOW_SIGNATURES` | `live` | the same run: the 21-byte list settles the act with no signers | `Handlers/PetitionsHandler.cpp:259-272` |
| `MSG_PETITION_RENAME` | `live` | the same run renames the charter to `FacFgklphhpapcZ`; the 24-byte echo settles the act | `Handlers/PetitionsHandler.cpp:335-397` |
| `CMSG_OFFER_PETITION` | `live` | probe flow `charters-sign` owner `Fgkmgeajfdi` (account `FAC6AC6409538`, deleted) offers 2v2 arena charter `0x400000000017883c` to partner `Fgkmgeajhon` twice; both traces show the send and the partner receives `SMSG_PETITION_SHOW_SIGNATURES` with the offer; the owner hears nothing back (`no_reply`). Both accounts staged at the arena organizer (entry 29534, map 571) (artifacts `597-wave7/charters/FAC6AC6409538-20261007T125509Z`, `597-wave7/charters/FAC6AC64097ED-20261007T125439Z`) | `Handlers/PetitionsHandler.cpp:568-657` |
| `CMSG_PETITION_SIGN` | `live` | probe flow `charters-sign` signer `Fgkmgeajhon` (account `FAC6AC64097ED`, deleted) signs the offered charter with charter guid `3c88170000000040`; the act settles `ok` | `Handlers/PetitionsHandler.cpp:400-470` |
| `SMSG_PETITION_SIGN_RESULTS` | `live` | the same run: both traces show the 20-byte result `3c88170000000040 f70b000000000000 00000000` (petition guid, signer guid, code 0); both acts settle `ok` | `Handlers/PetitionsHandler.cpp:529-544` |
| `MSG_PETITION_DECLINE` | `unseen` | the signer's trace shows the 8-byte decline send `3c88170000000040`; no `MSG_PETITION_DECLINE` reaches the owner in either trace, because the handler reads only the petition guid and forwards to an empty owner guid (`Handlers/PetitionsHandler.cpp:551-564`). The client parser is proven by a mock test from the writer bytes. Two live tries (the signer's decline, then the wait for a server form) | `Handlers/PetitionsHandler.cpp:562-564` |
| `CMSG_TURN_IN_PETITION` | `live` | the owner turns the unsigned charter in first (`3c88170000000040` plus zeros) and again after the signature (plus five zero emblem values); both sends are in the trace | `Handlers/PetitionsHandler.cpp:753-758` |
| `SMSG_TURN_IN_PETITION_RESULTS` | `live` | the same run: the early turn-in answers `04000000` (code 4, need more signatures) and the signed turn-in answers `00000000` (code 0, `PETITION_TURN_OK`) and the arena team `FacAcSign` (id 247, 2v2) exists afterwards, disbanded before the accounts are deleted | `Handlers/PetitionsHandler.cpp:833-835` |

Live `MinPetitionSigns`: 9 (field 6 of the guild showlist entry in `wave5/probe-charters-live`).
