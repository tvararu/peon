# tuicraft factory service

> Record copy for the [Pi harness epic spec](../2026-09-26-pi-harness-epic-design.md),
> taken 2026-09-26 from the epic's scratch notes. `HANDOVER.md` (the
> coordinator's working notes) was not kept: its rulings R1-R38 are the
> spec's Decisions section. Paths under `~/.cache/pi-epic-scratch/`, and
> scratch files in the checkout's `tmp` directory other than the copies in
> this directory, were not kept. Wrapper, account and eval paths in that
> directory name outputs that the described tools write at run time.
> `src/...` paths before the workspace split now live under
> `packages/<pkg>/src/`.


JSON over HTTP for the tuicraft eval runner. It reads the characters DB, and it
changes offline factory characters.

- **Address:** `http://100.73.138.96:7879/` (the Tailscale IP of t1 only; plain HTTP, no auth).
- **Unit:** `systemctl --user status tuicraft-factory` (user unit, lingering, starts at boot).
- **Logs:** `journalctl --user -u tuicraft-factory` (one JSON line for each request).
- **Files:** `~/srv/tuicraft-factory/service/`: `service.ts`, `presets.json`, `limits.json`.
  The DB password is in `service.env` (mode 600). The DB user `tcservice` can
  read `acore_auth.account` and `acore_world`, and read and write `acore_characters`.

## Rules

1. **Account rule.** The service works only on characters of factory accounts. An
   account is a factory account when all of these are true:
   - The name matches `^FAC[0-9A-F]{10}$`.
   - The first 8 hex digits after `FAC` are a Unix time, and this time is within
     600 s of the time when the server created the account (`account.joindate`, UTC).
     The tuicraft soap tool writes the creation time there. A hand-made name does
     not pass.
   - The name is not on the protected list: `ADMIN`, `DEITY`, `X`, `Y`,
     `AUCTIONHOUSE`, `TCFACTORY`, `TCPRESETS`, and every name that starts with
     `RNDBOT`.

   Other accounts get `403` with the reason `protected_account` or
   `not_factory_account`. This includes reads (`truth`).
2. **Offline only.** Every write endpoint changes offline characters only. If the
   character is in the world, the reply is `409` with the reason
   `character_online`. The service never kicks a character. After a tuicraft
   disconnect, the character stays in the world for about 40 s.
   Exception: `snapshot` also works online, because it saves first and only reads.
3. **Do not log in while a write runs.** Each write locks the character row and
   checks `online` again in its transaction. A login that starts during a write
   can still load the old state.
4. **JSON everywhere.** Success: `{"ok":true,...}`. Error:
   `{"ok":false,"reason":"<code>","error":"<text>"}`, with an HTTP status of 4xx or 5xx.
5. **Serial SOAP.** The worldserver handles one SOAP request at a time. The service
   sends its own SOAP calls one at a time. Calls that the client sends directly to
   SOAP wait in the same queue on the server.

### Reason codes

| Reason | Status | Meaning |
|---|---|---|
| `bad_argument`, `bad_json`, `bad_name`, `bad_map` | 400 | Wrong input. `error` names the field and the range |
| `protected_account`, `not_factory_account` | 403 | See rule 1 |
| `character_not_found`, `account_not_found`, `unknown_item`, `unknown_quest`, `unknown_tele`, `unknown_preset`, `snapshot_not_found`, `unknown_endpoint` | 404 | The thing does not exist |
| `character_online` | 409 | See rule 2 |
| `no_space`, `not_enough_items`, `quest_not_in_log`, `not_one_character` | 409 | The state does not allow the change |
| `too_many_stacks`, `not_a_bag` | 400 | See `items/add` |
| `not_supported` | 422 | `life` with `dead` or `ghost` |
| `send_failed`, `level_failed`, `tele_failed`, `quest_*_failed`, `revive_failed`, `erase_failed`, `pdump_failed`, `pdump_write_failed`, `save_failed` | 422 | The console command failed. `error` has the server text |
| `name_changed` | 500 | `reset` or `restore` got a different character name. The old name was not free |
| `soap_unreachable` | 503 | The worldserver SOAP port does not answer |
| `save_timeout`, `write_timeout`, `mail_timeout` | 504 | A change did not reach the DB within 5 s |
| `docker_failed`, `internal`, `soap_bad_reply` | 500/502 | A fault on t1. Tell t1 |

## Endpoints

In the examples, `T=http://100.73.138.96:7879`. `<char>` is a character name
(case does not matter). Every POST body is a JSON object.

### `GET /readme`

This file. Default: `{"ok":true,"readme":"<markdown>"}`. With `?format=md`:
the raw markdown as `text/markdown`.

```sh
curl -s $T/readme | jq -r .readme
curl -s "$T/readme?format=md"
```

### `GET /health`

No arguments. Status `200` when `ok` is true, `503` when it is false.

```sh
curl -s $T/health
```

```json
{"ok":true,"authUp":true,"worldUp":true,"dbUp":true,"soapUp":true,
 "build":"6a755d048d30+","uptimeSec":14852,"playersOnline":1,"charactersInWorld":62,
 "worldTickMs":{"last":1,"mean":6,"median":1,"p95":23,"p99":36,"max":49},
 "factoryOnline":2,"limits":{...see limits.json...},"ms":20}
```

- `authUp` and `worldUp` are TCP checks of ports 3724 and 8085. `soapUp` is a
  `server info` call with a 4 s limit.
- `worldTickMs` comes from `server info`. It covers the last 500 world updates.
- `charactersInWorld` includes the playerbots. `factoryOnline` counts `FAC…`
  characters in the world.

### `GET /presets`

No arguments. It lists each preset with live data from its template.

```sh
curl -s $T/presets
```

```json
{"ok":true,"presets":[{"name":"eversong10","template":"Tpleversong","notes":"...",
  "guid":2513,"race":10,"class":5,"gender":1,"level":10,"money":50000,
  "map":530,"zone":3430,"x":8735,"y":-6685,"z":70.5,"o":1.686,"online":false}]}
```

### `GET /accounts`

No arguments. It lists every account whose name matches `^FAC[0-9A-F]{10}$`,
from the server DB, not from a local ledger. `factory` is false when the name
time does not match the creation time (rule 1).

```sh
curl -s $T/accounts
```

```json
{"ok":true,"accounts":[{"account":"FAC6AB822E4BF","createdAt":"2026-09-26T19:54:12.000Z",
  "factory":true,"online":true,
  "characters":[{"name":"Fgkliccoelp","guid":3066,"level":10,"online":true}]}]}
```

### `GET /truth/<char>`

The saved state of one character. If the character is online, the service sends
`saveall` first. Then it waits until the save of this character is in the DB
(5 s maximum, else `save_timeout`).

```sh
curl -s $T/truth/Fsvctesta
```

```json
{"ok":true,"online":false,"savedAt":"2026-09-26T19:04:55.896Z",
 "guid":2958,"account":"FAC6AB817400D","name":"Fsvctesta",
 "race":10,"class":5,"gender":1,"level":12,"xp":10,"money":123486,
 "position":{"map":530,"zone":3433,"x":7564.25,"y":-6872.23,"z":96.04,"o":4.36},
 "hearth":{"map":530,"zone":3430,"x":8714.14,"y":-6650.33,"z":72.75},
 "alive":true,"deathState":"alive","health":28,"power":[607,0,0,100,0,0,0],
 "inventory":[{"bag":255,"slot":23,"item":117,"name":"Tough Jerky","count":20,
   "durability":0,"maxDurability":0,"guid":1055036}],
 "quests":[{"quest":8325,"status":3,"rewarded":false,"explored":false,"timer":0,
   "mobCounts":[3,0,0,0],"itemCounts":[0,0,0,0,0,0]}],
 "rewardedQuests":[8325],
 "reputation":[{"faction":911,"standing":1000,"flags":17}],
 "spells":[585,2050],
 "mail":[{"id":1,"subject":"...","money":0,"items":1}],
 "totalTimeSec":93,"levelTimeSec":93,"totalKillsPvp":0}
```

- `savedAt`: online → the time of the save that the service asked for. Offline → the
  last logout (`logout_time`). Offline writes by this service do not change `savedAt`.
- `inventory[].bag`: `255` = the character itself. Slots 0–18 are equipment,
  19–22 are the bag slots and 23–38 are the backpack. `bag` 0–3 = the
  bag in slot 19–22. `-1` = a bank bag.
- `quests[].status`: 0 none, 1 complete, 3 incomplete, 5 failed (AzerothCore
  `QuestStatus`).
- `deathState`: `alive`, `dead` (health 0) or `ghost` (the ghost flag is set).
- **Not in the DB:** PvE kill counts and death counts. `totalKillsPvp` counts PvP
  kills only.

### `POST /char/<char>/<operation>`

All operations: the character must be offline (rule 2). Success returns
`{"ok":true,"char":"<name>","changed":{...}}`. `changed` gives the new values.

| Operation | Body | Notes |
|---|---|---|
| `position` | `{"map":530,"x":8735,"y":-6685,"z":70.5,"o":1.686,"zone":3430}` | `map` is 0, 1, 530 or 571. `o` (default 0) and `zone` (default 0) are optional. The server corrects `zone` at the next login. The z value must be standable. The service does not check it |
| `position` | `{"tele":"Tranquillien"}` | A `game_tele` name. The server moves the character (console `tele name`) and sets the zone |
| `level` | `{"level":12}` | 1–80. Console `character level`. XP becomes 0. Stats, spells and talents are updated at the next login |
| `money` | `{"copper":50000}` | 0–2147483646 |
| `xp` | `{"xp":100}` | 0 to (XP for the next level − 1) |
| `hearth` | `{"map":530,"zone":3430,"x":8735,"y":-6685,"z":70.5}` or `{"tele":"FairbreezeVillage","zone":3430}` | `zone` is required |
| `rep` | `{"faction":911,"standing":1000}` | Raw standing from −42000 to 42999, relative to the base standing of the faction. The server ignores factions that cannot have reputation |
| `items/add` | `{"item":117,"count":20}` | Into the backpack, then into equipped normal bags (not quivers or special bags). Maximum 12 stacks for each call |
| `items/add` | `{"item":4496,"count":4,"equipBag":true}` | Puts containers into the empty bag slots 19–22 |
| `items/remove` | `{"item":117,"count":5}` | From the backpack and bag contents only, not from equipment or the bank. All or nothing |
| `items/clear-bags` | `{}` | Removes everything from the backpack and from the contents of the equipped bags. Equipment and the bags themselves stay |
| `spells/learn` | `{"spell":2050}` | Adds the spell row. The server does not check the spell before the next login, and it removes a spell that does not exist |
| `spells/unlearn` | `{"spell":2050}` | Removes the spell row. mod-learn-spells can teach class spells again at the next level-up |
| `quest/add` | `{"quest":8325}` | Console `quest add` |
| `quest/complete` | `{"quest":8325}` | Console `quest complete`. Status becomes 1 |
| `quest/remove` | `{"quest":8325}` | Console `quest remove`. Also removes the rewarded state |
| `quest/reward` | `{"quest":8325}` | Console `quest reward`. The quest must be complete. It gives the money and XP, and the items by mail. It gives no reputation |
| `quest/objective` | `{"quest":8325,"index":1,"count":3}` | Sets the kill or object counter `index` 1–4. The quest must be in the log. It does not change the status: send `quest/complete` when all counters are full. For item objectives, use `items/add`. The server counts items from the bags |
| `life` | `{"state":"alive"}` | Console `revive`. The character is alive at its next login. `dead` and `ghost` give `not_supported`: the server keeps no saved "dead" state, and a corpse row written with SQL is not in a loaded map. To get a dead character, let a creature kill it after login |
| `snapshot` | `{"label":"before-fight"}` | Label `^[a-z0-9_-]{1,32}$`. `pdump write`, stored on t1 in `~/srv/tuicraft-factory/snapshots/<ACC>/<char>--<label>.dump`. The same label overwrites. Works online (saves first) |
| `restore` | `{"label":"before-fight"}` | Erases the character and loads the snapshot with the same name on the same account. **The guid changes** (see `changed.guid`) |

Example:

```sh
curl -s -XPOST $T/char/Fgkliccoelp/items/add -d '{"item":117,"count":45}'
```

```json
{"ok":true,"char":"Fgkliccoelp","changed":{"item":117,"name":"Tough Jerky","count":45,
 "placed":[{"bagGuid":0,"slot":34,"itemGuid":1055036,"count":20},
           {"bagGuid":0,"slot":35,"itemGuid":1055037,"count":20},
           {"bagGuid":0,"slot":36,"itemGuid":1055038,"count":5}]}}
```

`items/add` works like this: the server makes the items with `send items` (so it
gives the item guids), and the service moves them from the mailbox into the bags.
If the move fails, the items stay in the mailbox. The server's cached mail count for
the character is then one too high until the next worldserver restart. This has
no effect in the game.

### `POST /account/<ACC>/reset`

Body `{"preset":"eversong10"}`. The account must have exactly one character, and
the character must be offline. The service erases the character and copies the
preset template again with the same name. **The guid changes.** This removes all
mail, items, quests and other state.

```sh
curl -s -XPOST $T/account/FAC6AB817400D/reset -d '{"preset":"eversong10"}'
```

```json
{"ok":true,"account":"FAC6AB817400D","character":"Fsvctesta","guid":2963,"preset":"eversong10","ms":118}
```

## Presets

Copy with `pdump copy <template> <ACC> <name>` over SOAP (the tuicraft soap
tool). Templates are on account `TCPRESETS`. Do not log them in. Backup dumps are in
`~/srv/tuicraft-factory/presets/`.

| Preset | Template | Faction, race, class | Level | Start (map, zone, x, y, z, o) | Money | Bags and items |
|---|---|---|---|---|---|---|
| `fresh` | `Tplfresh` | Horde, female Blood elf priest | 1 | 530, Sunstrider Isle start (10349.6, −6357.3, 33.4) | 0 | Start gear. Never logged in |
| `eversong10` | `Tpleversong` | Horde, female Blood elf priest | 10 | 530, 3430, 8735, −6685, 70.5, 1.686 | 5 g | 4 × Portable Hole (24 slots), food, potions. Unchanged |
| `eversong10-warrior` | `Tplwarrior` | Horde, male **Orc** warrior | 10 | Same as `eversong10` | 5 g | 4 empty Small Brown Pouch (6 slots), 20 Tough Jerky, Hearthstone |
| `eversong10-mage` | `Tplmage` | Horde, female Blood elf mage | 10 | Same as `eversong10` | 5 g | 4 empty pouches, 20 Tough Jerky, 20 Refreshing Spring Water, Hearthstone |
| `eversong10-hunter` | `Tplhunter` | Horde, male Blood elf hunter | 10 | Same as `eversong10` | 5 g | 4 empty pouches, 20 Tough Jerky, 1000 Sharp Arrow (ammo slot set), Hearthstone. Pet: Ravager (entry 17525), level 10 |
| `elwynn1` | `Tplelwynn` | Alliance, male Human warrior | 1 | 0, Northshire start (−8950.0, −132.5, 83.5) | 0 | Start gear. Never logged in |
| `elwynn10` | `Tplgoldshire` | Alliance, female Human priest | 10 | 0, 12, −9455, 55, 56.8, 1.790 | 5 g | 4 empty pouches, 20 Tough Jerky, 20 Refreshing Spring Water, Hearthstone |
| `ghostlands20` | `Tplghost` | Horde, male Blood elf priest | 20 | 530, 3433, 7575, −6835, 89.1, 4.007 | 20 g | 4 empty pouches, 20 Freshly Baked Bread, 20 Ice Cold Milk, Hearthstone |
| `max80` | `Tplmax` | Horde, female Blood elf priest | 80 | 571, 4395, 5808.0, 588.5, 660.9 | 3392 g | Unchanged. Progression tier 18 |

- Blood elves cannot be warriors in 3.3.5a, so `eversong10-warrior` is an Orc.
- The level 10 and 20 presets have green (uncommon) gear, talents and spells from
  `.playerbots bot initself=uncommon`. The gear was chosen at random once, and the
  template fixes it.
- The hearthstones of the new presets are bound to their start point.
- **Start points:** each start point is on open ground with one walkable level. A GM
  character 45 yd above the point and above the points 5 yd N, S, E and W saw no
  object between the sky and the terrain (FloorZ = GroundZ).
  - `elwynn10` is on the road between the Lion's Pride Inn and the smithy. The inn
    has a roof at z 74.
  - `ghostlands20` is on the ground below the Tranquillien platform. On the
    platform there is floor 2–4 yd above the terrain (two levels).
  - All level-10 Horde presets use the `eversong10` point east of the Fairbreeze inn.
- **Hunter copies can fail silently.** `pdump copy Tplhunter` can collide with a pet
  id that a playerbot took at the same time. SOAP then still says "Character loaded
  successfully!", but no character is made. Confirm each copy with `pinfo` (the
  client does this now), and copy again if the character is missing. 2 of 7 hunter copies
  failed in this way on 2026-09-26.

## Vendors near each start

Distance is in yards, in 2D, from the preset start point. "Repair" means that the
NPC can repair. All rows are normal spawns (not event spawns) in phase 1.

| Preset | Entry | Name | Role | Repair | Map | x | y | z | Distance |
|---|---|---|---|---|---|---|---|---|---|
| `fresh` | 15287 | Shara Sunwing | General Supplies | No | 530 | 10374.1 | −6391.8 | 38.6 | 42 |
| `fresh` | 15289 | Raelis Dawnstar | Weaponsmith | Yes | 530 | 10407.7 | −6351.8 | 37.1 | 58 |
| `eversong10`, `-warrior`, `-mage`, `-hunter` | 16444 | Halis Dawnstrider | General Goods | No | 530 | 8731.7 | −6656.5 | 70.7 | 29 |
| same | 16261 | Sathiel | Trade Supplies | Yes | 530 | 8682.7 | −6695.0 | 73.2 | 53 |
| `elwynn1` | 152 | Brother Danil | General Supplies | No | 0 | −8901.6 | −112.7 | 82.0 | 52 |
| `elwynn1` | 78 | Janos Hammerknuckle | Weaponsmith | Yes | 0 | −8909.5 | −104.2 | 82.0 | 49 |
| `elwynn10` | 151 | Brog Hamfist | General Supplies | No | 0 | −9465.3 | 9.6 | 57.1 | 46 |
| `elwynn10` | 2046 | Andrew Krighton | Armorer & Shieldcrafter | Yes | 0 | −9462.3 | 87.8 | 58.4 | 34 |
| `ghostlands20` | 16528 | Provisioner Vredigar | Provisioner | Yes | 530 | 7555.7 | −6857.7 | 93.7 | 30 |
| `max80` | 29493 | Jarold Puller | Specialty Ammunition | Yes | 571 | 5783.2 | 553.3 | 651.7 | 43 |
| `max80` | 32216 | Mei Francis | Exotic Mounts | No | 571 | 5833.8 | 570.1 | 652.0 | 32 |

- Vredigar stands on the Tranquillien platform, about 5 yd above the start point.
- The `elwynn10` distances are from (−9455, 55).

## Limits

From `limits.json` (also in `/health`):

- **SOAP:** one request at a time on the server. One call takes 30–60 ms. One
  factory create (`account create` + `pdump copy` + `pinfo`) takes about 115 ms, one
  delete about 95 ms, and one `reset` about 120 ms.
- **Logins:** 58 factory characters logged in in one burst, with 500 bots in the world.
  Login p95 was 1.3 s. World tick p95 was 56 ms or less, and max 87 ms, the same as with
  no factory players. Use **60 simultaneous characters** as the tested limit. More was
  not tested. `PlayerLimit` is 1000. No per-IP or per-minute login limit is set.
- **Auth failures from the client:** see "Auth failures seen in the login test" below.

## Auth failures seen in the login test

On 2026-09-26 the load test used a tuicraft checkout with an old
`src/wow/crypto/srp.ts`. It dropped leading zero bytes of the salt and of B.
Accounts whose salt starts with `00` failed with `Auth proof failed: status 0x4`.
tuicraft `main` fixed this in `486da85`, before the test. It is not a server fault.

## Cleanup

`~/srv/tuicraft-factory/sweep.sh [hours]` deletes `FAC…` accounts older than
`hours` (default 6). It also removes snapshot folders of accounts that no longer
exist.
