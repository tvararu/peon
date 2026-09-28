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
| Buy from a vendor | `t5-vendor-buy-goldshire` | |
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


## Not shown by any scenario

These have tools or code but no scenario that checks them live:

- Training spells, repairing, and selling junk (`interact` `train`,
  `repair`, `sell_junk`).
- Group play: inviting, joining, leaving a group, and fighting as a group.
- Ranged combat as a hunter.
- Reading a shrine plaque (`t0-objects-read-shrine`, the agent never reached the shrine in budget).
- A sustained levelling run across several quests and zones.

Peon has no tool for mail, trade, the auction house, flight paths or
mounts.
