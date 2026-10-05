# Jev pilot: kiting

Date: 2026-10-05. Status: built in #578.
The second navigator slice after the pilot, after seeing units
([2026-10-05-jev-pilot-units-design.md](2026-10-05-jev-pilot-units-design.md)).

Question: can Jev keep a melee creature out of reach while a caster kills
it, when its fight moves are the pilot's collision-checked moves instead of
blind timed key presses?

## Decision

The combat loop drops its blind moves (forward, back and strafe held for
2.5 s with no collision check) and offers the pilot's moves instead:
`run_ahead`, the veers and turns, the strafes, `back_up` and `stop`, each
checked against the collision data and the inferred aggro ranges of other
creatures, and driven under the pilot's 1.5 s dead-man lease. One loop
keeps choosing both moves and casts, so there is no second loop to arbitrate
with: casting and moving are one choice per tick.

`engage` takes `kite: true`, which tells Jev to keep the target outside its
melee reach. The frame states that reach.

## Mechanics

From AzerothCore:

- Melee range is the two combat reaches plus 4/3 yd, at least 5 yd
  (`Unit::GetMeleeRange`, `Unit.cpp:807-811`), with 2.66 yd more while both
  move (`WorldObject::GetLeewayBonusRangeForTargets`, `Object.cpp:1765-1774`).
- A spell with a cast time fails or is cancelled while the caster moves
  (`Spell.cpp:3670-3677`, `4545-4551`), so a mage stands to cast Frostbolt
  and moves between casts.
- A player runs at 7 yd/s and backs up at 4.5 yd/s (`Unit.cpp:80-83`);
  creatures run at `speed_run` from `creature_template`. Frostbolt's slow
  (40%) brings a normal creature below the player's run speed.
- A level 10 mage has Frostbolt (slow), Frost Nova (instant root, 10 yd) and
  Fire Blast (instant).

## Frame

The combat frame gains the target's distance to its melee reach, whether it
is closing and how fast, from its observed positions, and its observed
snares and roots. Each move option says where the target would be after the
move and whether the character stays outside its reach.

## Proof

`t3-pilot-kite` (training) and `t3-pilot-kite-holdout` (held-out, another
area) start a level 10 mage near a lone melee creature. A run passes when
the creature dies, no melee swing, hit or miss, reached the character
during the fight (`combat/swung_at`), and the character lives. The bar is
3/3 on training and at least 2/3 on held-out. The walking and camp pilot
scenarios must still pass.

## Out of scope

- Ranged classes other than the mage, and pets.
- Kiting several creatures at once.
