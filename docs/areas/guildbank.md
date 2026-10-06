# guildbank

The `guildbank` area opens the guild vault at a nearby guild-vault object and moves copper and items through it. World-service code reads it through `session.areas.guildbank.state()`: `vault`, `money`, `tabs`, `items` (per-tab slot maps), `briefs`, `texts`, `logs`, `moneyWithdrawn`, `tabWithdrawals`, `pending` and `lastOutcome`. The area emits `opened`, `tab`, `tab_bought`, `tab_renamed`, `money_moved`, `moved`, `text_set`, `logged`, `money_queried`, `refused`, `no_change` and `unanswered`.

The acts:

- `queryTab(tab)` sends `CMSG_GUILD_BANK_QUERY_TAB`; the tab list settles it `tab`.
- `buyTab(tab)` sends `CMSG_GUILD_BANK_BUY_TAB`; the server only sells the next unbought tab (`Handlers/GuildHandler.cpp:369`), and the longer full list settles it `tab_bought`.
- `depositItem(bag, slot, tab, bankSlot)`, `withdrawItem(tab, bankSlot, bag, bagSlot)` and `moveWithinBank(srcTab, srcSlot, destTab, destSlot)` send `CMSG_GUILD_BANK_SWAP_ITEMS` (inventory form, or bank-only form within the vault). The tab list echoing the moved stack settles them `moved`.
- `setTabText(tab, text)` and `queryText(tab)` send `CMSG_SET_GUILD_BANK_TEXT` and `MSG_QUERY_GUILD_BANK_TEXT`; the text reply settles them `text_set`.
- `queryLog(tab)` sends `MSG_GUILD_BANK_LOG_QUERY` (one tab byte); the log reply settles it `logged` and lands in `logs`.
- `queryMoneyWithdrawn()` sends the empty `MSG_GUILD_BANK_MONEY_WITHDRAWN`; the 4-byte reply settles it `money_queried`.

The `guildbank` harness tool (`open`, `show`, `buy`, `rename`, `deposit_money`, `withdraw_money`, `deposit`, `withdraw`, `move`, `text`, `log`, `limits`) runs one act each: `open` finds the nearest vault object within 10 yards, `show` reads a tab before moves, and the rest map 1:1 to the acts above.

## Wire notes

- `CMSG_GUILD_BANKER_ACTIVATE` and every other vault-touching handler gate on `GetGameObjectIfCanInteractWith` with `GAMEOBJECT_TYPE_GUILD_BANK` (`Handlers/GuildHandler.cpp:280`); the range check refuses past interaction range and the debug log names the limit as 10. The store mirrors it with `GUILD_BANK_YARDS = 10`.
- The `CMSG_GUILD_BANKER_ACTIVATE` vault object is entry 187329, type 34 (`Handlers/GuildHandler.cpp:280`).
- `CMSG_GUILD_BANK_SWAP_ITEMS` is guid, `u8` bank-only, then either two tab/slot/item triples plus autostore and count, or one tab/slot/item triple plus autostore and the bag position (`Handlers/GuildHandler.cpp:330`).
- The `CMSG_GUILD_BANK_BUY_TAB` handler ignores any tab id that is not exactly the purchased count (`Handlers/GuildHandler.cpp:369`); the store therefore settles `tab_bought` only when the full list grows.
- `CMSG_GUILD_BANK_DEPOSIT_MONEY` and `CMSG_GUILD_BANK_WITHDRAW_MONEY` refuse an empty amount before touching the guild (`Handlers/GuildHandler.cpp:310`); bound items fail the swap with an equip error and no bank list follows, so the act settles `unanswered` on timeout.
- `CMSG_SET_GUILD_BANK_TEXT` applies without a list reply (`Handlers/GuildHandler.cpp:405`), which is why `setTabText` settles on the text echo.

## Left out

- Item deposit/withdraw/move have no live success trace: the staged guild owns zero tabs, so every swap send is answered by `SMSG_INVENTORY_CHANGE_FAILURE`, and the carried max80 gear is bound. The builders, the rig tests and the `moved` settlement on the list echo cover the success path.
- `SMSG_GUILD_EVENT` and `MSG_GUILD_PERMISSIONS` are observed but owned elsewhere; the area only surfaces the money moved and tab bought through its own events.
- The log reply for an empty tab is a 2-byte body with no entries; richer log shapes stay rig-tested.

## Capabilities row

Capabilities row: use the guild vault (open it, read and rename tabs, move copper and items, set tab text, read the log and limits), with no scenario: every verb needs a guild, which eval staging cannot create (see [capabilities.md](../capabilities.md)).

## Proof

Live proof on a `max80` throwaway (`FAC6AC567BC04`, `Fgkmfghlmae`, guild `FacVaultSix`, id 21, staged with `soap gm` on the online puppet: `guild-create` refuses while offline with "Player not found!", money and a Hearthstone arrived by mail, `tele stormwind`). The puppet walked to vault `0xf11002dbc1000211` (entry 187329, `-8902.25, 621.31, 100.92`) down to 6.91 yards with the new `walkToObject` call, then sent each verb with `puppet raw`; the packet trace is not committed. Guild truth moved 0 to 9 gold after a 100000-copper deposit minus a 1000-copper withdraw, then to 13 gold after a second deposit and the tab purchase.

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_GUILD_BANKER_ACTIVATE` | `live` | 9-byte raw send (guid plus full byte) at 6.91 yards; 16-byte `SMSG_GUILD_BANK_LIST` reply with 0 tabs | `Handlers/GuildHandler.cpp:280` |
| `CMSG_GUILD_BANK_QUERY_TAB` | `live` | 10-byte raw send for tab 0; 27-byte full-list reply | `Handlers/GuildHandler.cpp:300` |
| `SMSG_GUILD_BANK_LIST` | `live` | 16-byte (money, no tabs) and 27-byte (full tab 0) bodies after the `CMSG_GUILD_BANK_QUERY_TAB` send above | `Handlers/GuildHandler.cpp:300` |
| `CMSG_GUILD_BANK_SWAP_ITEMS` | `live` | 23-25-byte sends in inventory and bank-only forms; server answered `SMSG_INVENTORY_CHANGE_FAILURE` (no purchased tabs, bound gear) | `Handlers/GuildHandler.cpp:330` |
| `CMSG_GUILD_BANK_BUY_TAB` | `live` | 9-byte send for tab 0; `SMSG_GUILD_EVENT` plus permissions; truth bank rose with the purchase | `Handlers/GuildHandler.cpp:369` |
| `CMSG_GUILD_BANK_UPDATE_TAB` | `live` | 19/20-byte sends (name plus icon) on tab 0 | `Handlers/GuildHandler.cpp:378` |
| `CMSG_GUILD_BANK_DEPOSIT_MONEY` | `live` | 12-byte sends (100000 and 50000 copper); `SMSG_GUILD_EVENT`; truth 0 to 9 to 13 gold | `Handlers/GuildHandler.cpp:310` |
| `CMSG_GUILD_BANK_WITHDRAW_MONEY` | `live` | 12-byte send (1000 copper); `SMSG_GUILD_EVENT` | `Handlers/GuildHandler.cpp:321` |
| `MSG_GUILD_BANK_LOG_QUERY` | `live` | 1-byte send; 2-byte empty-tab reply | `Handlers/GuildHandler.cpp:389` |
| `MSG_GUILD_BANK_MONEY_WITHDRAWN` | `live` | empty send; 4-byte reply | `Handlers/GuildHandler.cpp:265` |
| `MSG_QUERY_GUILD_BANK_TEXT` | `live` | 1-byte send; 11/13-byte replies | `Handlers/GuildHandler.cpp:397` |
| `CMSG_SET_GUILD_BANK_TEXT` | `live` | 10/12-byte sends; 13-byte text reply surfaced as `text_set` | `Handlers/GuildHandler.cpp:405` |

Eval staging gap (escalation): no scenario is registered and none joins `ROUND_1`, because eval staging cannot create a guild or an arena team and `soap gm` is banned inside evals. A guild setup endpoint would unblock a real `guildbank` scenario; until then the verbs above are proven live through `soap gm` staging plus the puppet.
