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
| Mark targets | `t9-raid-mark` (round 90 replica 1, `pass` 3/3) | Icon names are unconfirmed. |

## Not shown by any scenario

These have tools or code but no scenario that checks them live:
- Resetting its own dungeons (`dungeon` `reset`): no scenario can stage the
  character inside a dungeon (the realm position setup accepts only
  continent maps, and evals may not teleport with a GM command), so the
  reset is proven by probe runs, failed inside the dungeon and reset
  outside it.

- Training spells, repairing, and selling junk (`interact` `train`,
  `repair`, `sell_junk`).
- Group play: inviting, joining, leaving a group, and fighting as a group.
- Ranged combat as a hunter.
- Reading a shrine plaque (`t0-objects-read-shrine`, the agent reads the page but quotes the placard line, not the page's opening sentence).
- Completing an exploration quest by walking into its area trigger (`t4-objects-explore-fargodeep`, the agent never reaches trigger 88: the accept points at `engage`, which fails explore quests, and compass exploring does not find the mine).
- A sustained levelling run across several quests and zones.
- Report its reputation with each faction and what changed it (`t4-reputation-gain`, no Faction.dbc in the eval profile so the journal names factions by id, not Silvermoon City).
- Set the action bar (`t4-spells-action-bar`, no server truth for the bar).
- Walking to a quest objective's region from `journal` (`t4-quests-poi-walk`):
  the agent takes the quest but walks by other means and never reads the
  region from `journal`.
- Come back to life where it died, with Reincarnation or a Soulstone (`t6-selfstate-res`, needs a self-res spell and its reagent; the server refuses silently under a no-resurrection aura).

Peon has no tool for mail, the auction house, flight paths or
mounts.
