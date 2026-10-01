# bank

The `bank` area lets the character open the bank, move items between the bags and the bank, and buy bank bag slots. World-service code reads it through `session.areas.bank.state()`: `banker` (the banker guid from the last `SMSG_SHOW_BANK`), `bagSlots` (bought slots, byte 2 of `PLAYER_BYTES_2`), `pending` (the open, move or slot purchase in flight), `lastSlotResult` and `lastOutcome`. The area emits `opened` on every show-bank, `moved` when a deposit or withdraw guid reaches the other side, `slot_bought` on every slot result, `refused`, `no_change` on result 59, and `unanswered` after 5 seconds of silence.

The move acts need an open banker in range:

- `openBank(npc)` sends `CMSG_BANKER_ACTIVATE` and settles `ok` on the matching `SMSG_SHOW_BANK`. Out of range sends nothing and settles `unanswered`.
- `deposit(bag, slot)` sends `CMSG_AUTOBANK_ITEM` and settles `ok` when the item guid reaches a bank position. A bank source is refused locally.
- `withdraw(bag, slot)` sends `CMSG_AUTOSTORE_BANK_ITEM` and settles `ok` when the item guid returns to the bags. A carried source is refused locally.
- `buyBankSlot()` sends `CMSG_BUY_BANK_SLOT` and settles on `SMSG_BUY_BANK_SLOT_RESULT` with its name.

Each act settles as `ok`, `refused` with the server's reason, `no_change`, or `unanswered` after 5 seconds of silence.

## Wire notes

- `CMSG_BANKER_ACTIVATE` is one `uint64` banker guid (`Handlers/BankHandler.cpp:44-62`). The server remembers the banker for the later moves.
- `CMSG_AUTOBANK_ITEM` is `uint8` bag, `uint8` slot (`Server/Packets/BankPackets.cpp:20-24`, `AutoBankItem::Read`; `Handlers/BankHandler.cpp:64`). An empty source position is silent (`Handlers/BankHandler.cpp:75-77`).
- `CMSG_AUTOSTORE_BANK_ITEM` is `uint8` bag, `uint8` slot (`Server/Packets/BankPackets.cpp:26-30`, `AutoStoreBankItem::Read`; `Handlers/BankHandler.cpp:98`). The same opcode moves both ways: the source position decides, `IsBankPos` (`Handlers/BankHandler.cpp:98`, `HandleAutoStoreBankItemOpcode`). A move out of the bank is stored in the bags and never equipped (`Handlers/BankHandler.cpp:112-122`), so the area counts the equipment region neither as bank nor as carried.
- `CMSG_AUTOBANK_ITEM` answers result 59 (`EQUIP_ERR_NONE`) only when the item is already where `CanBankItem` would put it (`Handlers/BankHandler.cpp:84-88`, `HandleAutoBankItemOpcode`); the area settles it as `no_change`, not a refusal.
- `CMSG_BUY_BANK_SLOT` is one `uint64` banker guid (`Handlers/BankHandler.cpp:143-184`). Away from a banker the server answers `not_banker` (`Handlers/BankHandler.cpp:146-151`); without enough money it answers `insufficient_funds` (`Handlers/BankHandler.cpp:168-175`); with every slot bought it answers `too_many` (`Handlers/BankHandler.cpp:156-164`).
- `SMSG_BUY_BANK_SLOT_RESULT` is one `uint32` with names `too_many`, `insufficient_funds`, `not_banker`, `ok` (`Entities/Player/Player.h:112-115`).
- The bank roots are `PLAYER_FIELD_INV` words for slots 39 to 66 (`region: "bank"`) and 67 to 73 (`region: "bankbag"`); `BankItemSlots` and `BankBagSlots` are at `Player.h` lines 698 to 705, and `inventory-bank.ts` reads them with `BANK_FIELD_RANGE` in the self ranges. Bank items and bank bags reach the client at login. `freeSlots` still counts carried bags only.
- `bagSlots` is byte 2 of `PLAYER_FIELDS.BYTES_2` (`update-fields.ts`, offset 154), named `PLAYER_BYTES_2_OFFSET_BANK_BAG_SLOTS` at `Player.h` line 507.
- `SMSG_SHOW_BANK` is owned by the legacy quest handlers (`gameplay-handlers.ts:208`) and `SMSG_INVENTORY_CHANGE_FAILURE` by the legacy loot handlers (`gameplay-handlers.ts:335`); the area peeks both and leaves their owners in place. A pending `talk` answered by a `bank` window settles without `lastError` because a bank opened through the bank area sets no giver there.

## Capabilities row

| Store items in the bank and take them out | `t9-bank-deposit`, `t9-bank-withdraw` | The bank verbs talk to a banker in range; `journal` `about: bank` reads the stored contents from the login snapshot anywhere. |
| Buy a bank bag slot | `t9-bank-slot` | The first slot of a fresh character costs 1000 copper. |

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_BANKER_ACTIVATE` | `live` | `bank-moves` at the Silvermoon bank (Novia, entry 16615, guid `0xf1300040e700293e`) on an `eversong10` character, exit 0; `SMSG_SHOW_BANK` follows and the act settles `ok` (run `probe-bank-live`, not committed) | `Handlers/BankHandler.cpp:44-62` |
| `CMSG_AUTOBANK_ITEM` | `live` | `bank-moves --arg item=6948` deposits the carried Hearthstone and settles `ok`; the trace shows `CMSG_AUTOBANK_ITEM` (run `probe-bank-live`, not committed) | `Server/Packets/BankPackets.cpp:20-24` |
| `CMSG_AUTOSTORE_BANK_ITEM` | `live` | the same run withdraws the stone back and settles `ok`; the trace shows `CMSG_AUTOSTORE_BANK_ITEM` (run `probe-bank-live`, not committed) | `Server/Packets/BankPackets.cpp:26-30` |
| `CMSG_BUY_BANK_SLOT` | `live` | `bank-moves --arg buy=7` with staged money buys two slots then stops at `insufficient_funds`; truth money falls 100000 to 89000 (run `probe-bank-rich`, not committed) | `Handlers/BankHandler.cpp:143-184` |
| `SMSG_BUY_BANK_SLOT_RESULT` | `live` (ok, `insufficient_funds`, `not_banker`) + `rig` (`too_many`) | ok and `insufficient_funds` live as above (run `probe-bank-rich`, not committed); `not_banker` live by `mise protocol:probe <ACCOUNT> --send CMSG_BUY_BANK_SLOT --body 3e2900e7400030f1` (the Silvermoon banker guid, sent from the Eversong spawn): the run `probe-bank-notbanker` (not committed) shows the 8-byte `CMSG_BUY_BANK_SLOT` out and `SMSG_BUY_BANK_SLOT_RESULT` in with body `02000000` (result 2); the `bank-moves` flow has no far mode because `buyBankSlot` refuses out of range before it sends; `too_many` is a rig test | `Entities/Player/Player.h:112-115` |
| `t9-bank-deposit` | `eval` | Round 423 pass 2/2: the agent deposits 20 Linen Cloth with Novia; truth shows the cloth in a bank row and the game log shows `bank/deposit` for `CMSG_AUTOBANK_ITEM` (`Server/Packets/BankPackets.cpp:20-24`) | `Handlers/BankHandler.cpp:64` |
| `t9-bank-withdraw` | `eval` | Round 423 pass 2/2: the agent deposits the cloth then withdraws it; truth shows the cloth carried and the game log shows `bank/withdraw` for `CMSG_AUTOSTORE_BANK_ITEM` (`Server/Packets/BankPackets.cpp:26-30`) | `Handlers/BankHandler.cpp:98` |
| `t9-bank-slot` | `eval` | Round 423 pass 2/2: the agent buys one bank bag slot; the game log shows `bank/slot` with result ok and truth money falls 100000 to 99000 for `CMSG_BUY_BANK_SLOT` (`Handlers/BankHandler.cpp:143-184`) | `Handlers/BankHandler.cpp:143-184` |
