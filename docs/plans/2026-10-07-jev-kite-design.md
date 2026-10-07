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
melee reach: slow it, back away and cast at range. Without `kite` a fight
keeps the same moves and the same frame.

## Frame

The fight frame carries a `melee` field. `gapYd` is the distance to the
target minus its melee reach (5 yd), negative inside the reach and `null`
when a position is unobserved. `closing` is `closing`, `opening` or
`holding` against the previous frame, or `unknown` without one. `snares`
lists the names of the slows and roots the character's own auras put on
the target, as observed. The `danger` line names the units in view and says
whether the way to the target enters an inferred aggro range.

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
`startSlots` places each replica on its own point:

- `t3-pilot-kite` (training) uses spawn `pilot-kite`: four points about
4 yd apart in a line tangent to the 25 yd ring southwest of the stalker
in Eversong Woods, east of Fairbreeze Village, by a lone Springpaw
Stalker (entry 15651, levels 6-7; spawn guid 55950 at (9069.0, -6707.3,
19.50), the only other stalker 23 yd away); every point sits 25-26 yd
from the stalker, outside its 16-17 yd aggro range and inside Frostbolt
range, with eye-height line of sight and walkable ground away;
- `t3-pilot-kite-holdout` (another area) uses spawn `pilot-kite-holdout`:
four points about 4 yd apart in a north-south line tangent to the 25 yd
ring west of the boar in Durotar, by a lone Elder Mottled Boar (entry
3100, levels 8-9; spawn guid 8678 at (1138.5, -3930.2, 20.23), no other
spawn within 30 yd, melee-only with BaseAttackTime 2000 and
RangeAttackTime 2000); every point sits 25-26 yd from the boar, outside
its 18-19 yd aggro range and inside Frostbolt range, with eye-height
line of sight and walkable ground away. Spawn data comes from the
AzerothCore `creature` and `creature_template` tables; ground z for the
points comes from the namigator navmesh.

The `pilot_kite` measure passes when a kill credit exists for the
scenario's target creature, zero melee swing rows aimed at the character
occur between the first `engage` call and the kill, and the character is
alive at the end. It also reports `endHealthPct` and `movesAway`: the
number of the character's server-recorded moves during the fight that
increase distance from the target. The bar is 3/3 on training and at least
2/3 held-out, as for the walking scenarios, which must still pass, with the
two camp scenarios.

## What the live rounds found

The live rounds are recorded in the PR.

## Out of scope

- The pilot inside `travel`.
- Indoor (WMO) navigation data.
