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
| Walk to a named NPC | `t1-walk-to-npc` | Routes come from the Namigator navmesh, which is built from the game's data files, not observed. |
| Answer whispers from another player | `t2-whisper-reply` | A chat line with no echo within 2 s is `UNCONFIRMED`. |
| Kill creatures at its level, one at a time, with Jev choosing the actions | `t3-ghostlands-kill` | Needs Jev: after repeated failed Jev calls the fight ends as `jev_unavailable`. A hunter can end up in melee range, because `travel` stops 3 yd from a unit, so no scenario proves ranged hunter play. |
| Take a quest, do it and turn it in | `t4-quest-first`, `t4-alliance-first` | An accept or a turn-in the server does not answer is `UNCONFIRMED`; the agent checks the quest log before it tries again. |
| See which NPCs have a quest or a quest to turn in | `t4-quests-find-giver` | |
| Hear what an NPC says when talked to | `t1-quests-read-greeting` | |
| Follow a guard's directions to a marked point | `t1-quests-guard-directions` | |
| Walk to where a quest's objective is | `t4-quests-poi-walk` | Accepting a quest with a far region points `next` at `journal`, which names the region and a `travel` call to it. |
| Buy from a vendor | `t5-vendor-buy-goldshire` | |
| Buy back an item sold by mistake | `t5-buyback-vendor` | Only items sold this session. |
| Die, then come back to life | `t6-die-and-recover` | |
| Stop on command and resume | `t7-halt-resume` | |
| Answer a question while an action runs | `t7-question-while-acting` | |
| Wear better gear and put a bag on | `t8-items-equip-upgrade` | |
| Take off worn gear and keep it in bags | `t8-items-unequip` | |
| Move an item into a bag | `t8-items-move` | |
| Split a stack | `t8-items-split` | |
| Open a container and keep its contents | `t8-items-open` | |
| Read a letter in its bags | `t8-items-read` | The Dusty Unsent Letter's page text is empty on this server. |
| Load arrows for a ranged weapon | `t8-items-ammo` | |
| Cancel one of its own buffs | `t4-spells-cancel-aura` | Harmful and passive auras cannot be cancelled. |
| Stop a channelled spell with stop | `t4-spells-stop-channel` | Stop also ends a channel. |
| Make an inn its home | `t8-travel-bind-inn` | `interact` `bind` walks to the innkeeper first. A bind the server does not answer (dead, out of range or in an instance) is `UNCONFIRMED`. |
| Use the hearthstone to go home | `t8-travel-hearth-home` | `travel` `hearth` refuses without the stone, on cooldown, in combat or in flight. The scenario starts at the preset's own home, so it does not show a bind at another inn. |
| Command a pet: call, dismiss, attack, follow, stay, stop and stance | `t8-pets-command` | Hunter only; no warlock or death knight preset. |
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
| Share a quest with the group and take one shared back | `t8-quests-share`, `t8-quests-accept-shared` | A share with no member answer is `UNCONFIRMED` after 3 s. |
| Set loot rules and give master loot | `t9-raid-master-loot` | Needs a corpse that holds an item; the scenario allows three kills. `roll` and `pass_loot` are not shown: a group roll needs an uncommon drop and `pass_loot` has no server reply. |
| Run and answer ready checks | `t9-raid-ready`, `t9-raid-answer` | Peon ends its own checks after 30 s. |
| Mark targets | `t9-raid-mark` | Icon names are unconfirmed. |

## Not shown by any scenario

These have tools or code but no scenario that checks them live:
- Resetting its own dungeons (`dungeon` `reset`): offline setup cannot place
  the character inside a dungeon (the realm position setup accepts only
  maps 0, 1, 530 and 571, and evals may not teleport with a GM command).
  Walking in from the Ragefire Chasm portal (area trigger 2230, map 1) does
  not work either: two live tries started the agent beside the portal in
  the Cleft of Shadow on a `fresh` character, and both graded `fail` with
  0 of 4 checks met. `travel` refused with `unsupported_map_1` (no Kalimdor
  navigation data on this host) and walked 0 yd, so the agent never entered.
  The reset is proven by probe runs, failed inside the dungeon and
  reset outside it.

- Training spells, repairing, and selling junk (`interact` `train`,
  `repair`, `sell_junk`).
- Group play: inviting, joining, leaving a group, and fighting as a group.
- Ranged combat as a hunter.
- Reading a shrine plaque (`t0-objects-read-shrine`, the agent reads the page but quotes the placard line, not the page's opening sentence).
- Completing an exploration quest by walking into its area trigger (`t4-objects-explore-fargodeep`): accept names the quest region and `travel` to the area triggers in it, at their height, but trigger 88 lies in the mine tunnel (z 5.37, 33 yd under the hillside) and the route planner refuses the route into it (`pathfind_find_height` fails with `UNKNOWN_HEIGHT`), so the agent never enters the trigger sphere. Round 157 never reached the trigger: the agent spawned about 430 yd from the giver and never accepted quest 62. Round 197 replicas 1 and 2 accepted quest 62 and walked the hillside above trigger 88 without entering its sphere; replica 3 entered the decorative trigger 197 and hit the tunnel `UNKNOWN_HEIGHT` refusal on the way to trigger 88.
- A sustained levelling run across several quests and zones.
- Report its reputation with each faction and what changed it (`t4-reputation-gain`, no Faction.dbc in the eval profile so the journal names factions by id, not Silvermoon City).
- Set the action bar (`t4-spells-action-bar`, no server truth for the bar).
- Come back to life where it died, with Reincarnation or a Soulstone (`t6-selfstate-res`, blocked: the server drops Reincarnation from a non-shaman preset at login, so no preset has a self-resurrection spell).
- Give a master-looted item to a group member (`t9-raid-master-loot`, the agent sets master loot but its kills leave empty corpses or it names the loot method wrongly, so no item is given).
- Answer a raid ready check (`t9-raid-answer`, the agent answers before the check starts, and the repeat guard then refuses its answer during the check).
- Accept a quest a party member shares (`t8-quests-accept-shared`, the agent's early `accept_invite` is refused as a repeat, so it is not in the group when the partner shares).

Peon has no tool for mail, the auction house, flight paths or
mounts.
