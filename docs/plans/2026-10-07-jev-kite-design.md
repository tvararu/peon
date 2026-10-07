# Jev pilot: kiting in fights

Date: 2026-10-07. Status: built in #578.
The second of four navigator slices after the pilot
([2026-10-04-jev-pilot-design.md](2026-10-04-jev-pilot-design.md)): units
([2026-10-05-jev-pilot-units-design.md](2026-10-05-jev-pilot-units-design.md)),
kiting, the pilot inside `travel`, and indoor (WMO) navigation data.

Question: can a ranged character kill a lone melee creature without taking
a melee swing, when the fight offers the pilot's collision-checked moves
and the frame says how far the target is from its melee reach?

## Decision

The combat loop offers the pilot's moves (`run_ahead`, the veers, the
turns, the strafes, `back_up` and `stop`) beside the spells, instead of the
blind forward, back and strafe moves it held for 2.5 s. The options come
from the pilot's collision and ground data, with the target as the goal,
and Jev picks among them; code only removes the options the ground or a
range forbids. Each move faces its heading and drives it under the pilot's
1.5 s dead-man lease, so the character stops 1.5 s after the last decision.
`engage` takes `kite: true`, which tells Jev to keep the target outside its
melee reach. Without `kite` a fight keeps the same moves and the same frame.

## Kite rails

The first live round (0/4) showed Jev choosing `back_up` almost every
frame, even 20 yd out with spells offered. A backpedalling mage is slower
than a chasing creature, so every fight reached melee. Retreating out of
spell range also ended the fight `target_unreachable`, and a refused move
ended it `obstructed` or `too_steep`. A kite fight therefore narrows what
Jev sees, in the same way the pilot masks moves that enter an aggro range:

- Retreat is `run_away`, a full-speed run of up to 10 yd straight away from
  the target; `back_up` is never offered. Retreat appears only while the
  gap is under 8 yd, or the target is closing inside 12 yd.
- No move may end beyond the longest supported spell's range minus 3 yd;
  approach moves appear only beyond that range.
- The melee reach adds the server's 2.66 yd moving leeway
  (`Unit::IsWithinMeleeRange`, `GetLeewayBonusRange`).
- A refused move is withdrawn for 4 s instead of ending the fight;
  `target_unreachable` waits while the target is in spell range or closing.
- `wait` re-checks the current heading and stops when it is no longer legal.
- The instruction gives the order: slow at range, cast while the gap is
  open, root at melee, run while rooted or slowed, turn and cast again.

The second round (1/2 on training) showed why the order needs a rail too:
the `eversong10-mage` template knows only Fireball, Fire Blast and Arcane
Intellect, so the passing run killed the stalker before it closed and the
failing one was caught. The kite scenarios therefore learn Frostbolt (116)
and Frost Nova (122) in setup, the spells a level 10 mage has from its
trainer. While the target carries no root or slow, code offers only the
spells that put one on: a targeted slow at any range, and a root centred on
the character once the target is within 10 yd.

## Frame

The fight frame carries a `melee` field. `gapYd` is the distance to the
target minus its melee reach, negative inside the reach and `null` when a
position is unobserved. `closing` compares against the previous frame Jev
saw, not against the checks code runs before a move. `snares` lists the
slows and roots on the target with their kind, as observed. The `danger`
line names, per offered move, whose inferred aggro range it enters.

## Danger steering

Danger counts every creature that attacks first, whatever the frame lists
(the frame keeps its five): the pilot's unit lines cover up to five, but
the ranges behind an option come from every qualifying creature
(follow-up from the #577 review). The fight's own target and every
creature that attacks the character add no range, because the fight already
accepts them. Gray creatures add none either, as in the pilot.

## Swing row

Every melee swing at the character, hit or miss, is a `combatlog/swing_in`
row: the attacker, the outcome (`hits` when the log gives none) and the
amount. Rows from the character itself and from unknown sources are not
logged. The row is what the measure counts.

## Scenarios and measure

Both scenarios run on the `eversong10-mage` preset and start the character
from a named spawn group instead of a setup position step, so the grader's
`startSlots` places each replica on its own point. Each group holds six
points (two per replica through replica 3: agent plus partner each).

- `t3-pilot-kite` (training) uses spawn `pilot-kite`: six points in a
tangent line southwest of the stalker in Eversong Woods, east of
Fairbreeze Village, by a lone Springpaw Stalker (entry 15651, levels 6-7;
spawn guid 55950 at (9069.0, -6707.3, 19.50), the only other stalker 23 yd
away). Points for replicas 1 and 2 sit 25-26 yd from the stalker; the
replica-3 pair sits 26.9 yd away:
(9046.4, -6718.1) 25.05 yd, (9048.4, -6721.5) 25.02 yd,
(9044.4, -6714.6) 25.66 yd, (9050.4, -6725) 25.68 yd,
(9042.4, -6711.1) 26.87 yd, (9052.4, -6728.5) 26.93 yd.
- `t3-pilot-kite-holdout` (another area) uses spawn `pilot-kite-holdout`:
six points in a north-south line tangent to the 25 yd ring west of the
boar in Durotar, by a lone Elder Mottled Boar (entry 3100, levels 8-9;
spawn guid 8678 at (1138.5, -3930.2, 20.23), no other spawn within 30 yd,
melee-only with BaseAttackTime 2000 and RangeAttackTime 2000). Points for
replicas 1 and 2 sit 25-26 yd from the boar; the replica-3 pair sits
26.9 yd away:
(1113.5, -3928.2) 25.11 yd, (1113.5, -3932.2) 25.11 yd,
(1113.5, -3924.2) 25.75 yd, (1113.5, -3936.2) 25.73 yd,
(1113.5, -3920.2) 26.97 yd, (1113.5, -3940.2) 26.94 yd.

Every point sits outside its creature's aggro range (16-17 yd for the
stalker, 18-19 yd for the boar) and inside Frostbolt range, with
eye-height line of sight and walkable ground away. Spawn data comes from
the AzerothCore `creature` and `creature_template` tables; ground z for
the points comes from the namigator navmesh.

The `pilot_kite` measure passes when the scenario's creature (named by
`evidence.creature` in the check, name plus entry) receives a
`combat/kill_credit` whose guid an `engage` call with `kite: true`
targeted before the kill. Targets resolve by guid: the `fight/start`
row's `jevRun` ties the fight to the engage's run id, and a `u..` ref is
matched against row refs, so a name-only or omitted target still binds.
The swing window starts at the earlier of the first kite engage and the
first combat event with that guid (a fight started on a travel run still
counts), and ends at the kill. Zero `combatlog/swing_in` rows aimed at
the character in that window, and the character alive at the end, is a
pass. `endHealthPct` and `movesAway` use the same window.

## What the live rounds found

The live rounds are recorded in the PR.

## Out of scope

- The pilot inside `travel`.
- Indoor (WMO) navigation data.
