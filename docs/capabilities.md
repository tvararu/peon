# Capabilities

What a Peon character can do in the game today, the eval scenario that
proves each capability on the live server, and its known limits. A
capability counts only when a scenario checks it against server truth;
a design or a passing unit test is not evidence. How the scenarios run
and are graded is in [evals.md](evals.md); which opcodes core handles is
in [protocol-coverage.md](protocol-coverage.md).

`mise lint:docs` fails when an eval scenario is missing from this page
or the page names one that does not exist.

## Proven by a scenario

| Capability | Scenarios | Known limits |
|---|---|---|
| Report its own state: level, health, mana, money, bags, gear | `t0-self-state` | |
| Say who and what is nearby, and which units are hostile | `t0-who-is-near`, `t0-hostiles` | Only units the server has sent. A unit out of view is last seen, with the state it had then. |
| Walk to a named NPC | `t1-walk-to-npc` | Routes come from the Namigator navmesh, which is built from the game's data files, not observed. A route across swim-depth water swims across and climbs out. |
| Answer whispers from another player | `t2-whisper-reply` | A chat line with no echo within 2 s is `UNCONFIRMED`. |
| Emote at a player or NPC | `t2-emotes-partner` | Only emotes the server lists; none while dead; no ready check. |
| Join a channel it owns and kick another player off it | `t2-channels-kick` | Kicking, banning and the other admin verbs need the channel moderated by the caller, usually as its owner. An admin call the server does not answer is `UNCONFIRMED`. |
| Move with Jev choosing every input: run a circle, walk around an obstacle, jump a low fence (`pilot`) | `t3-pilot-circle`, `t3-pilot-detour`, `t3-pilot-fence`, `t3-pilot-circle-holdout`, `t3-pilot-detour-holdout`, `t3-pilot-fence-holdout` | Rounds 7687 and 7702 (with creatures in the frame) each passed 18 of 18 replicas: about 4.5 decisions a second at a 200–225 ms Jev p50, no server corrections. Needs Jev and namigator data for the map. |
| Walk past hostile creatures without drawing aggro, with Jev steering (`pilot`) | `t3-pilot-camp`, `t3-pilot-camp-holdout`; baselines `t3-pilot-camp-travel`, `t3-pilot-camp-holdout-travel`, `t3-pilot-camp-greedy`, `t3-pilot-camp-holdout-greedy` | Round 7702 passed 6 of 6 camp replicas; on the same camps the greedy chooser passed 1 of 4 and `travel` 1 of 4. Aggro ranges are inferred from levels, not observed: the server's aggro rate, detection auras and line of sight are unknown to the client. Gray creatures add no danger; any other creature that attacks ends the pilot run. |
| Take a quest, do it and turn it in | `t4-quest-first`, `t4-alliance-first` | An accept or a turn-in the server does not answer is `UNCONFIRMED`; the agent checks the quest log before it tries again. A turn-in names the reputation changes the reward carried, and `journal` log search with `since: last_turn` reaches back to the previous turn's start. |
| Play a new level 1 character to level 5 by doing quests | `t4-quests-level-five` | Passed in round 7531: level 5 with five quests rewarded in 53 minutes and no `start_off_mesh` refusal. A character standing just off the navmesh is nudged up to 1.5 yd back onto it before `travel` plans again. |
| Gather quest loot from game-object chests | `t4-objects-quest-loot` | After the last loot, the loop waits up to 3 s for the quest-complete flag before it reports no targets left, and it fights back an attacker that interrupts it. |
| See which NPCs have a quest or a quest to turn in | `t4-quests-find-giver` | |
| Hear what an NPC says when talked to | `t1-quests-read-greeting` | |
| Follow a guard's directions to a marked point | `t1-quests-guard-directions` | |
| Walk to where a quest's objective is | `t4-quests-poi-walk` | The accept result names the region and a `travel` call to it; `journal` names it again when asked. |
| Complete an exploration quest by walking into its area trigger | `t4-objects-explore-fargodeep` | Accept names the quest region and `travel` to the area triggers in it, at their height, so the plan reaches trigger 88 under the hillside (z 5.37). The mine's kobolds attack on most legs, and the agent fights each before it resumes; the run passed in 290 s, over the scenario's tool budget. |
| Buy from a vendor | `t5-vendor-buy-goldshire` | |
| Buy back an item sold by mistake | `t5-buyback-vendor` | Only items sold this session. |
| Die, then come back to life | `t6-die-and-recover` | |
| Come back to life where it died, with Reincarnation and an Ankh | `t6-selfstate-res` | Shaman only: the `eversong1-shaman` preset. One Ankh covers one self-resurrection; a later death is not recovered. |
| Kill named creatures with Jev choosing the actions, stop on command and resume | `t7-halt-resume` | Needs Jev: after repeated failed Jev calls the fight ends as `jev_unavailable`. A hunter can end up in melee range, because `travel` stops 3 yd from a unit, so no scenario proves ranged hunter play. |
| Answer a question while an action runs | `t7-question-while-acting` | |
| Wear better gear and put a bag on | `t8-items-equip-upgrade` | |
| Take off worn gear and keep it in bags | `t8-items-unequip` | |
| Move an item into a bag | `t8-items-move` | |
| Split a stack | `t8-items-split` | |
| Open a container and keep its contents | `t8-items-open` | |
| Read a letter in its bags | `t8-items-read` | The Dusty Unsent Letter's page text is empty on this server. |
| Load arrows for a ranged weapon | `t8-items-ammo` | |
| Socket a gem into gloves | `t8-items-socket` | |
| Cancel one of its own buffs | `t4-spells-cancel-aura` | Harmful and passive auras cannot be cancelled. |
| Drop a profession | `t4-spells-unlearn-profession` | Only primary professions. |
| Stop a channelled spell with stop | `t4-spells-stop-channel` | Stop also ends a channel. |
| Turn a blood rune into a death rune with Blood Tap | `t4-spells-death-runes` | Death knight only: the `eversong55-deathknight` preset. The conversion shows as "Rune 1 is now a death rune." and `journal about:spells` names each rune's type and readiness; Blood Tap's death rune turns back into blood after 20 s. |
| Make an inn its home | `t8-travel-bind-inn` | `interact` `bind` walks to the innkeeper first. A bind the server does not answer (dead, out of range or in an instance) is `UNCONFIRMED`. |
| Use the hearthstone to go home | `t8-travel-hearth-home` | `travel` `hearth` refuses without the stone, on cooldown, in combat or in flight. The scenario starts at the preset's own home, so it does not show a bind at another inn. |
| Ride a boat or zeppelin to another dock | `t8-vehicles-zeppelin` | `travel` `ride <stop>` needs the transport path and taxi node files from the game's data files. The scenario rides the Orgrimmar zeppelin to Thunder Bluff on map 1; cross-map rides are not shown. |
| Ride a mount and get off it | `t9-selfstate-mount` | Needs a known mount spell; mounting fails indoors and in combat. The scenario starts at Bleeding Vale on map 571 and rides about 200 yd south along the road to the Vengeance Landing road below the inn at (1873.32, -6180), in front of Timothy Holland's building. The ride ends outside because the inn interior is unroutable: Holland's column at (1873.32, -6218.15) has floors 67.13, 35.39, 24.92, 23.20 and 13.10, and planning at z 13.18 fails with a ground corridor collision. |
| Fly to a discovered destination and walk on from the landing | `t8-travel-fly` | `travel` `fly <destination>` flies from a flight master in view, or from one at a known node on the same map within 300 yd; the first visit to a master learns its path and a landing steps onto the ground. A mounted character is refused ("Get off your mount first."). The scenario starts in Tranquillien, 54 yd from the master, and flies to Silvermoon City; the agent walked west when it was asked to walk north. |
| Command a pet: call, dismiss, attack, follow, stay, stop and stance | `t8-pets-command` | Hunter only. |
| Cast and autocast pet spells | `t8-pets-spells` | Feed Pet needs an item-target cast and is not covered. A cast whose spell the catalog does not know is `UNCONFIRMED`. A pet far from its target fails out of range: send it with attack first. |
| Rename or abandon a hunter pet | `t8-pets-rename`, `t8-pets-abandon` | A pet can be renamed once. Abandon runs only when the agent names the pet; it cannot be undone. Taming a new beast has no scenario. |
| Stable a pet, call it back and buy a stable slot | `t8-pets-stable` | Needs a stable master near the spawn; the scenario starts in Tranquillien, 48 yd from the master, and walks to it. |
| Spend talent points | `t8-talents-spend` | Learns only for the active spec. A server refusal has no reason on the wire; the reason shown comes from local rules. |
| Reset talents at a class trainer | `t8-talents-reset` | Pays only up to the cost the agent allows. |
| Get on a vehicle by clicking it and get off | `t8-vehicles-board` | The client does not read seat flags, so a request the seat forbids shows as no answer. The scenario uses the 7th Legion Chain Gun in Dragonblight, which a Horde `max80` can click; hostile Riflemen stand near it. |
| Drive a vehicle and use its abilities | `t8-vehicles-drive` | Only ground vehicles while control refuses flying. The scenario boards a Horde Siege Tank for quest 11652, moves with it, and gets off. |
| Apply and remove glyphs | `t8-talents-glyph` | Active spec only. The slot type is found by trying. |
| Set dungeon difficulty | `t9-instances-difficulty` | A solo change is not confirmed until the next dungeon entry; in a group only the leader can change it. |
| Queue for the dungeon finder and leave | `t9-lfg-queue` | Joining needs an LFG option on the server; a queue with no reply is reported as disabled. |
| Enter and leave a dungeon-finder dungeon with a party | `t9-lfg-run` | Needs a full party of five; the dungeon finder cannot bring a ghost back. |
| Reset its own dungeons | — (not shown; see below) | Normal difficulty only; a group member cannot reset. |
| Remove a member with a reason | `t9-raid-kick` | A party of two disbands. |
| Run a raid: convert, subgroups, assistants, main tank and main assist | `t9-raid-convert` | Every member must be level 10 or more; the server refuses the convert below that. Flags and subgroups are shown by roster rows only, not by a truth field. |
| Give items and gold to another player | `t9-trade-give` | One trade window at a time, up to 6 items. Only a player in range (11 yards). |
| Take a trade another player offers | `t9-trade-receive` | The agent accepts after it reads both offers. |
| Swap items with another player | `t9-trade-swap` | |
| Refuse or cancel a trade | `t9-trade-cancel` | |
| Store items in the bank and take them out | `t9-bank-deposit`, `t9-bank-withdraw` | The bank verbs talk to a banker in range; `journal` `about: bank` reads the stored contents from the login snapshot anywhere. |
| Buy a bank bag slot | `t9-bank-slot` | The first slot of a fresh character costs 1000 copper. |
| Use the guild vault: open it, read and rename tabs, move copper and items, set tab text, and read the log and limits | `t9-guildbank-guildless` | Run guildless: the vault refuses with not in a guild. The member verbs are proven by the `guildbank-vault` probe flow, not a scenario: an eval cannot stage a guild. |
| Read mail | `t9-mail-read` | The letter is staged by an offline quest reward; the answer quotes its fixed body. |
| Collect gold and items from mail | `t9-mail-collect` | Takes money then attachments in order at a mailbox. |
| Send gold or items by mail | `t9-mail-send` | Postage is 30 copper per item, 30 with no item. |
| Buy a guild charter and read how many signatures it needs | `t9-guild-charter` | The guild charter needs 9 signatures on this realm; the 2v2 arena charter needs 1. Offer, sign, decline and turn in need other players and are proven by tests only. |
| Open the tabard designer and try to save a guild emblem | `t9-guild-tabard` | Run guildless: the server refuses the save with code 2 and takes no gold. A leader's save, ranks, notes, the info text and the event log are proven by probe flows, not a scenario: an eval cannot stage a guild. |
| Read play time, draw weapons, hide helm and cloak | `t0-character-appearance` | Sheathe, helm and cloak sends get no server reply. |
| Share a quest with the group and take one shared back | `t8-quests-share`, `t8-quests-accept-shared` | A share with no member answer is `UNCONFIRMED` after 3 s. |
| Create and rename a personal calendar event | `t9-calendar-event` | Needs no guild. The server allows one create or copy every 5 s and 30 events per player. Invites, rsvp and status need a second player and are proven by tests only. |
| Set loot rules and give master loot | `t9-raid-master-loot` | Needs a corpse that holds an item; the scenario allows three kills. `roll` and `pass_loot` are not shown: a group roll needs an uncommon drop and `pass_loot` has no server reply. |
| Run and answer ready checks | `t9-raid-ready`, `t9-raid-answer` | Peon ends its own checks after 30 s. |
| Answer a meeting-stone summon | `t9-raid-summon` | Two partners use the Stormwind stone 179595 and its summoning portal; the agent answers with `group` `summon`. The stone needs a group with both members at level 15. |
| Mark targets | `t9-raid-mark` | Icon names are unconfirmed. |
| Spend pet talent points | `t8-pets-talent` | Hunter only; spends one point of the pet's own talent tree at owner level 25. |
| Join and leave an arena skirmish queue (`arena` `queue`) | `t9-arena-skirmish` | Unrated 2v2 at battlemaster Gargok in the Barrens, with no team. Rated joins, teams, rosters and invites need a staged team (eval staging gap) and are proven by the probe flow `arena-team`. |
| Inspect a nearby player's arena teams (`arena` `inspect`) | `t9-arena-inspect` | Shows the partner's teams from `MSG_INSPECT_ARENA_TEAMS`. Shows teams only: the agent's own teams, the roster, invites and the queue need a staged team (eval staging gap: needs an arena setup endpoint; `soap gm` is banned in evals) and are proven by the probe flow `arena-team`. |
| Join Wintergrasp (`wintergrasp` `accept`, `leave`) | `t9-pvp-wintergrasp` | Waits for the grouping window with a read-only `bf-queue` console wait (a battle starts about every 3 hours: 150 minutes of peace, then a 30-minute war), then joins the battle and hearths out. |
| Turn its PvP flag on and off (`pvp` `flag`) | `t9-pvp-flag` | The flag stays on for a few minutes after it is turned off. |
| Join and leave a battleground queue (`pvp` `queue`) | `t9-pvp-queue` | Needs level 10. |
| Recover at a battleground spirit guide (`recover` `how:spirit_guide`) | Not shown | Queues at the guide for the next mass resurrection; needs a battleground match, so no scenario shows it live. |
| Play a battleground to the end (`t9-pvp-warsong`) | Not shown | Needs a Warsong Gulch match that random bots fill, which no eval setup can stage. |

## Not shown by any scenario

These have tools or code but no scenario that checks them live:
- Choosing creatures at its level and pulling one at a time (`engage`,
  `look`): no scenario checks the target choice or the pull size live.

- Changing ranks, member notes and the info text, and reading permissions and
  the event log (`guild` `rank`, `note`, `officer_note`, `info_text`,
  `permissions`, `log`), and saving an emblem as a leader: a scenario needs
  a guild, and neither the realm setup nor an eval may create one (`soap gm`
  is banned in evals). The probe flows `guildadmin-ranks` and
  `guildadmin-tabard` prove the server replies on a staged guild
  ([guildadmin.md](areas/guildadmin.md#proof)). Needs a guild setup endpoint.

- Resetting its own dungeons (`dungeon` `reset`): offline setup cannot place
  the character inside a dungeon (the realm position setup accepts only
  maps 0, 1, 530 and 571, and evals may not teleport with a GM command).
  Walking in from the Ragefire Chasm portal (area trigger 2230, map 1) does
  not work either: two live tries started the agent beside the portal in
  the Cleft of Shadow on a `fresh` character, and both graded `fail` with
  0 of 4 checks met. `travel` refused with `unsupported_map_1` in those runs
  and walked 0 yd, so the agent never entered.
  The reset is proven by probe runs, failed inside the dungeon and
  reset outside it.

- Training spells, repairing, and selling junk (`interact` `train`,
  `repair`, `sell_junk`).
- Place and remove a totem (no shaman preset, so no destroy-totem
  scenario: `SMSG_TOTEM_CREATED` stays `unseen` and the destroy verb is
  proven by unit tests only).
- Group play: inviting, joining, leaving a group, and fighting as a group.
- Ranged combat as a hunter.
- Reading a shrine plaque (`t0-objects-read-shrine`, the agent reaches the shrine and `use read` returns the whole page, but the agent quotes the placard line inside the page instead of the page's opening sentence).
- A sustained levelling run across several quests and zones.
- Report its reputation with each faction and what changed it (`t4-reputation-gain`, no Faction.dbc in the eval profile so the journal names factions by id, not Silvermoon City).
- Set the action bar (`t4-spells-action-bar`, no server truth for the bar).
- Give a master-looted item to a group member (`t9-raid-master-loot`, the agent sets master loot but its kills leave empty corpses or it names the loot method wrongly, so no item is given).
- Answer a raid ready check (`t9-raid-answer`, the agent answers before the check starts, and the repeat guard then refuses its answer during the check).
- Accept a quest a party member shares (`t8-quests-accept-shared`, the agent's early `accept_invite` is refused as a repeat, so it is not in the group when the partner shares).
- Changing seats, riding with another player and ejecting a passenger (`vehicle` `seat`, `ride_with`, `eject`).
- Hearing a GM's answer to its ticket (`tickets/gm_reply` wakes the agent with the answer; there is no verb that files a ticket, so no scenario shows it, and the area doc records the wire proof).
- Reach level 10 from a new level-1 Blood Elf paladin within an hour (`t4-speedrun-level-ten`, round 6101 played the full 75 minutes and reached level 4 with 2317 XP in the first hour: routes out of the Sunspire fail, fights against Tenders and Springpaw Lynxes take about a minute each, Tenders killed the character 6 times, and `engage` cannot fight while Jev is unavailable).

Peon has no tool for the auction house.
