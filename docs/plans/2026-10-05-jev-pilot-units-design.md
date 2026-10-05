# Jev pilot: seeing units

Date: 2026-10-05. Status: built in #576.
The first of four navigator slices after the pilot
([2026-10-04-jev-pilot-design.md](2026-10-04-jev-pilot-design.md)): units,
kiting, the pilot inside `travel`, and indoor (WMO) navigation data.

Question: can Jev route the character past a camp of hostile creatures
without drawing aggro, when the frame shows the creatures and where they
would notice it?

## Decision

The pilot frame gains the nearby hostile creatures and an inferred aggro
range for each. Danger stays in code, as with walls: a move that would walk
into an inferred range within the next 2 yd is not offered. Jev trades off
the goal against the ranges among the moves that remain. A creature that
starts attacking ends the pilot run, because the pilot cannot fight.

## Aggro range

AzerothCore decides proximity aggro in `Creature::CanStartAttack`
(`src/server/game/Entities/Creature/Creature.cpp:1922-1961`). The range comes
from `Creature::GetAggroRange` (`Creature.cpp:3450-3490`):

- 20 yd (`m_detectionDistance`, `Creature.cpp:271`) minus the character's
  level above the creature's, so one yard per level;
- at most 45 yd (`MAX_AGGRO_RADIUS`, `Unit.h:44`) and at least 5 yd;
- times `Rate.Creature.Aggro`, 1 by default.

Only hostile creatures aggro on proximity; neutral ones and civilians do
not. A ground creature more than 3 yd above or below the character does
not aggro (`Creature.cpp:1940-1941`). Line of sight also has to hold. A
creature that aggroes calls same-faction creatures within 10 yd
(`CreatureFamilyAssistanceRadius`) to help.

The client cannot see the server's rate, auras that change detection range
or line of sight as the server computes it, so the range is an inference.
Every surface labels it so (the uncertainty rules in
[docs/harness.md](../harness.md)).

## Frame

`units` lists up to 5 hostile, living creatures within 60 yd, nearest to
their range first. Each line keeps the observed facts (name, level, bearing
bucket, distance, standing, moving, in combat or attacking you) apart from
the inferred ones (the aggro range and how far outside it the character
is). A creature more than 3 yd above or below is listed as on another level
and adds no danger.

## Danger steering

For each move option, code finds the distance along its heading after which
the character enters any inferred range, padded by 1 yd:

- within 2 yd, the option is not offered, unless the character is already
  inside that range and the move takes it further from the creature;
- within 10 yd, the option text says whose range it enters and after how
  many yards;
- the line to the goal says when it passes through a range.

`stop` is always offered.

## Baselines

Two baselines run on the same places:

- `travel`, which follows the navmesh route and ignores creatures;
- the pilot with a deterministic chooser instead of Jev
  (`PEON_PILOT_CHOOSER=greedy`): among the offered moves, the one that
  points closest to the goal. It sees the same masking, so it measures
  what Jev adds over code alone.

## Proof

The straight line runs through the inferred ranges of at least two
hostile creatures, and so does the `travel` navmesh route. A walkable
detour stays at least 4 yd outside every range:

- `t3-pilot-camp` (training, `fresh` level 1, Eversong Woods): two
  Springpaw Stalkers, level 6-7, inferred range 26 yd, goal 70 yd out.
- `t3-pilot-camp-holdout` (held-out, `elwynn10` level 10, south Elwynn):
  a Defias camp of two Defias Bandits that wander, one on a short patrol,
  a Rogue Wizard and Thuros Lightfingers, level 8-11, inferred range
  19-21 yd, goal 74 yd out. The straight line passes 1.5 yd from one
  bandit and the `travel` route 2 yd, so both walk into the camp.

A run passes when the final server-truth position is within 3 yd of the
goal, no creature attacked or threatened the character during the pilot
run, and only `pilot` moved it. The bar is 3/3 on training and at least
2/3 on held-out, as for the walking scenarios, which must still pass.

## Out of scope

- Kiting and fighting while moving.
- The pilot inside `travel`.
- Creatures that patrol along waypoints are seen where they are now; their
  future path is not predicted beyond the observed spline.
