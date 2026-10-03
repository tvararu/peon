# Multi-floor navigation: choosing the floor

Date: 2026-10-03. Status: design; nothing is built.
Issue: #512, with #445 (`t4-objects-explore-fargodeep`) and #492
(`t8-travel-fly`).

Question: travel refuses or loses its way where the ground has more than one
floor (`ambiguous_floor`, `floor_retry`, `path_corner_disagrees`,
`UNKNOWN_HEIGHT`). Do we make the height data hold the surfaces the navmesh
path uses, or does the planner trust a mesh surface that `findHeights` does
not return?

## Decision

Neither. The two sources have different jobs, and the fix keeps them apart:

- `findHeights` is the only source of a walked z. Every point of a route sits
  on a surface it lists, so the route never floats and never walks a surface
  the data lacks.
- The Detour mesh decides which of those surfaces can be walked: its corridor
  gives the xy path, and a surface it has no polygon for is not a floor.
- A mesh corner z is a hint, not a surface. It is only held against the data
  when the data has a surface near it.

This reuses the existing planner (`createNavigation`, `GroundRoute`,
`planRoute`), needs no new navigation data and no server change. It is five
small rules (R1 to R5 below) that each relax one check in the places where
offline measurement shows the check refuses a walkable route, and keep every
other check: floor, climb, return trace, clear headroom and collision.

## Evidence

Sources: the run directories of #445 (rounds 621 and 622, 11 runs of
`t4-objects-explore-fargodeep` and 2 of `t1-walk-to-npc`) and #492 (five
`t8-travel-fly` runs, rounds 604, 605 x2, 627 and 628), and the round 701
evaluation runs (27 runs, finished while this note was written).
Positions are the pose before the refused leg and the leg's goal, in map
coordinates. The offline experiments below ran the planner on the real
navigation data (maps 0, 530 and 571) with the `libnamigator.so` built from
`vendor/namigator`, through scratch scripts that are not part of the change.

### Refusal codes

| Code | Raised where | Why | Where it fired |
| --- | --- | --- | --- |
| `ambiguous_floor` | `planner.ts` `destinationFloor` (more than one clear floor in the destination column) and `checkDestination` (the given z is on no floor); `travel-leg.ts` `KNOWN` maps both texts to this code | The point goto has no z, or a z the column lacks, and `findHeights` lists several floors. The refusal is correct; the trouble is what follows it. Floors that differ by less than a step are counted as separate floors (`FLOOR_MERGE` is 0.01) | Fargodeep, map 0, goal (-9820, 143) floors 51.74 and 4.92, in every #445 run (90 refusals in 11 runs); Silvermoon, map 530, goal (9412.8, -7164.9) floors 38.09 and 11.63 (59 refusals in 5 runs); round 701 `t3-ghostlands-kill` goal (7823.4, -6925) floors 82.81 and 80.77 from (7674.1, -6854.6, 84.4); round 701 `t8-vehicles-drive` unit goal floors 7.7585 and 7.7437 (0.015 apart) at (2816.9, 6714.3, 10.1) on map 571 |
| `floor_retry` | `travel-leg.ts` `travelLeg` retries once with the floor nearest the player's z (`selfFloor`, `matchFloor`) and `nav-log.ts` `logRouteReplaced` logs it. It is a log reason, not a refusal | The nearest floor to the player is chosen from the data alone. 89 retries in #445 ended 61 arrived and 11 `end_snapped_off`; 59 retries in #492 ended 9 arrived and 27 `path_corner_disagrees`, 10 `end_snapped_off`, 9 `unknown_path` and 4 `no_ground`; 7 retries in round 701 ended 3 arrived and 4 `end_snapped_off` | Same positions as `ambiguous_floor` |
| `end_snapped_off` | `planner.ts` `rejectSnap`: `findPath` returned an end more than the float rounding away from the requested x, y, z | The floor the retry picked has a surface in `findHeights` but no mesh polygon. Of the 26 replayed cases, the other floor of the column routes in 11 (Fargodeep goal (-9820, 143): 4.92 snaps off, 51.74 plans) and the rest have no routable floor at all | #445 goal (-9820, 143, 4.9) from (-9793.4, 151.2, 24.4); #492 goal (9412.4, -7224.1, 15.3) from (9412.4, -7164.8, 11.6); round 701 `t3-ghostlands-kill` goal (7791.3, -6806.5, 65.8) from (7632.8, -6806.7, 79.7) |
| `path_corner_disagrees` | `planner.ts` `groundPath` (the `cornerMatches` check in `swim.ts`, `meshCornerOnGround`) | A corner of the Detour path has a z the walked ground does not match. Two causes, see C1 and C4 | #445 from (-9753.4, 135.2, 20.6) to (-9843.5, 127.5, 5.4); 8 refusals in round 622. #492 from (9412.5, -7164.9, 11.6) to (9432.5, -7164.9, 13.0), 27 refusals in 5 runs |
| `UNKNOWN_HEIGHT` (`no_ground`) | `namigator.ts` `findHeight` raises it when the navmesh raycast from the source leaves the mesh or `getPolyHeight` fails; `findHeights` returns `[]` for it. `planner.ts` `lostHeight` retries with the column floor; `travel-leg.ts` `KNOWN` maps it to `no_ground` | The ground trace is lost where the corridor runs along a polygon edge, and the column fallback (`slopeFloor`) then refuses a column of thin stacked surfaces. See C2 | #445 from (-9841.7, 173.6, 22.6) and (-9850.5, 179.3, 21.0) to (-9843.5, 127.5, 5.4); #492 `no_ground` at (9384.6, -7252.9, 6.6) |
| `unreachable` | Not a code in a run: `planner.ts` `classifyNavigationRefusal` groups `UNKNOWN_PATH`, `end snapped off` and `native path omits destination` into this refusal class, which `observation.ts` and the explore fallback read. In the logs the codes are `pathfind_find_path_failed_unknown_path` and `end_snapped_off` | `findPath` has no path between the pose's connected polygons and the goal: the goal floor is on another component | #492 10 `unknown_path` from (9398.5, -7181.3, 11.5) to (9300.7, -7181.3, 17.1) and from (9367.6, -7017, 18.9); #445 `unknown_path` from (-9758.4, 195.4, 49.5) |
| `stuck` | `tools/travel.ts` `unstickWork`: the unstick walk moved less than `MIN_UNSTICK_YD` | A consequence, not a cause: every leg from the pose refuses with the same fault, then unstick finds no open ground | No `stuck` row in the #445, #492 or round 701 runs; the codes above are what the agent sees |

The other refusal rows in the same runs (`ground_corridor_collision`,
`start_off_mesh`, `ambiguous_ground_column`, `surface_change`) are not in
this issue's scope and keep their current meaning.

### Causes found offline

**C1. A mesh corner z is not a surface.** Detour's straight path takes a
corner's z from polygon edges, and the mesh quantises heights to
`CellHeight` (0.25) with a detail error. On a slope that puts a corner far
above the ground: the Fargodeep route from (-9753.4, 135.2, 20.6) has mesh
corners at z 26.70 and 25.70 over ground 18.08 and 17.98, and 19.70 over
12.32, with `findHeights` listing only the ground and a surface near 49. No
surface exists near the mesh z. `meshCornerOnGround` (`swim.ts`) refuses any
corner more than `CORNER_RISE` (1.25) above the walked ground, so a walkable
route is refused. Every step of the walk between those corners succeeds with
`findHeight`, which is a mesh raycast, so the mesh does support the xy path
and the data supports the z.

**C2. Thin stacks defeat the column fallback.** Where the corridor hugs a
polygon edge, `findHeight` fails and `columnFallback` (`height.ts`
`slopeFloor`) must pick the floor from the column. It requires every
reachable height to be within 0.01 of the first. At (-9833.4, 207.4) the
column is 13.85, 13.73 and 14.06, with the walker on 14.059. 13.73 and 13.85
are not standable (14.06 is within headroom above them), yet `slopeFloor`
refuses the column. The Fargodeep routes from (-9841.7, 173.6, 22.6) and
(-9850.5, 179.3, 21.0) fail here, 20 steps after the last good height.

**C3. A floor with no mesh polygon.** `findHeights` enumerates geometry
(WMO and doodad triangles from the BVH, plus the ADT height), while the mesh
is built from the walkable subset of it. A floor that the data lists and the
mesh lacks cannot be reached and cannot be a goal. `floor_retry` chooses
among the data floors only, so it picks such a floor in about a third of its
retries (see the table). Planning each candidate floor offline over 150
random Silvermoon destinations: of 34 with several floors, 15 had exactly
one routable floor; in Fargodeep, 15 of 53; at the Northshire-area sample,
2 of 13. Where exactly one floor routes, nothing is ambiguous.

**C4. The data and the mesh disagree about a pocket in Silvermoon.** From
the landing at (9373.4, -7165.1, 9.1) a goal 20 yd east at (9432.5, -7164.9)
routes 70 yd south through the stair base near (9421.4, -7233.3), because a
wall blocks the direct way. The mesh corner there is z 14.93 and the column
is 16.68 and 14.67. The walker follows the ramp surface to 16.68 (steps of
0.03 per half yard from (9421.2, -7220.8)). Forcing the walk to the 14.67
floor makes it pass under a surface 0.55 above it at (9421.13, -7219.35),
and the collision rays then refuse it (`checkCollision`, head height 1.6).
This is not a surface the data lacks; the mesh corridor goes where collision
data says a character cannot. Trusting the mesh over collision would walk
into geometry, so the refusal is right. 23 of the 27 replayed corner
refusals after R1 and R2 end at this stair base; the other four are four
more Silvermoon spots with the same shape.

**C5. A spurious floor split.** `groundFloors` merges heights within
`FLOOR_MERGE` (0.01). Two surfaces 0.015 apart count as two floors, which
produces `ambiguous_floor` for the Siege Tank goal in round 701. Surfaces
within `GROUND_ERROR` (0.25) of each other cannot be different levels:
`clearAbove` already rejects any surface under another within headroom
(`MESH_HEIGHT` 1.6) by more than 0.25. A merge at 0.25 turns 9 of 668
multi-floor columns in Silvermoon, 13 of 1227 in Fargodeep and 66 of 219 at
the Northrend sample into single floors.

## Chosen fix

R1. **Column fallback picks the standable floor nearest the walker.**
`slopeFloor` works over `groundFloors` of the column, not the raw heights,
and returns the floor nearest the previous z when no other reachable floor is
more than `GROUND_ERROR` from it. Several clear floors in reach still
refuse. Fixes C2.

R2. **A mesh corner far above the ground is a hint.** `meshCornerOnGround`
accepts a corner more than `CORNER_RISE` above the walked ground when no
height in the column is within `CORNER_RISE` of the corner z. A corner below
the ground by more than `GROUND_ERROR`, and a corner above it that has a
data surface near its z, still refuse: those are the cases where the walk is
on a different floor from the mesh. Fixes C1.

R3. **Only floors the mesh routes are candidates for a destination without
a z.** `planGround` plans each floor of the destination column. One routable
floor is the destination. Several routable floors still raise
`ambiguous_floor`, now listing only those floors, so the agent still never
guesses z. None routable raises the most specific refusal of the attempts.
`floor_retry` keeps its role for the several-floors case. Fixes C3.

R4. **Silvermoon's pocket stays refused.** The refusal is correct and is
documented in `docs/areas/travel.md`. The explore fallback already blocks
the bearing after `path_corner_disagrees`; that behaviour is unchanged.
This is a stated limit of the approach, not a fix.

R5. **`groundFloors` merges floors within `GROUND_ERROR`.** The merged floor
reports the highest member. Fixes C5.

Measured on the replay (offline, no server): of the 85 refused legs in the
#445 and #492 logs that carry a pose and a goal with a z, all 85 refuse on
`main` as in the logs, and 10 plan with R1 and R2, every one a Fargodeep leg:
the three hand-checked legs above plan with 285, 263 and 272 points. R3 and
R5 act on destinations without a z and are measured separately above. On 420
random routes (Silvermoon, Fargodeep, Elwynn) R1 and R2 refuse no route that
`main` plans, change no planned route, and plan 6 that `main` refuses.

## Alternatives rejected

**Make the height data hold the mesh surface (a new namigator build).** The
mesh surface is not a surface: C1 shows corners 8.6 yd above any geometry.
`findHeights` enumerates geometry, so "holding" the mesh z means adding
floating floors, which would make `floor_retry` and the ambiguity check worse
(every column gains a floor). Making the mesh z precise instead would be a
change to Recast's detail mesh settings, a rebuild of the nav data for four
maps and a coordinator install, for a result the planner reaches without it.

**Trust a mesh surface `findHeights` lacks.** It walks a floating z. C1 gives
the size: up to 8.6 yd on Fargodeep slopes. It breaks the rule that a route
never walks a surface neither source supports.

**Prefer continuity and drop the headroom check.** I tried choosing, at every
step, the column height nearest the previous z, and waiving `clearAbove` when
the walker stays on its surface. It plans Fargodeep and leaves Silvermoon
refused (C4: the collision check still stops it), and on 420 random routes
it refuses five that `main` plans, all by `ground_corridor_collision`.
Rejected: it spends safety on the headroom check for no Silvermoon gain.

**Choose the floor per step from the mesh corridor's z.** I tried selecting,
at each step, the data surface within a climb of the interpolated corridor z.
It cannot work where the corridor z is an artefact (C1), and where it is
right (C4) the collision check refuses the result anyway.

**Drop the corner check, as #445's last commit did for tunnels.** It lets the
walk run on any floor the trace lands on, which includes the upper ramp in
C4: the corner check is what catches a walk on a floor other than the
corridor's. R2 relaxes it only where the data has no surface near the mesh z.

**Require a z for every goto.** `explore` generates ground goals without a z
from compass bearings and has none to give. Refusing ambiguity (the current
behaviour) stays; R3 only removes ambiguity the mesh already resolves.

## Implementation plan

Each step starts with a failing test on a fake native map, in the style of
`planner.test.ts`, `trace.test.ts` and `floors.test.ts`, and commits alone.
No step changes a tool's wording, and none needs `mise eval` before the last.

1. **R5, floor merge.** Test in `floors.test.ts`: a destination column
   `[7.7585, 7.7437]` plans, and `[10, 8]` (a floor 2 yd above another with
   headroom between) still raises `ambiguous_floor` with both floors.
   Change `groundFloors` in `column.ts`.
2. **R1, column fallback.** Test in `trace.test.ts`: with `findHeight`
   throwing `UNKNOWN_HEIGHT` and the column `[13.85, 13.73, 14.06]`, the
   walk from z 14.06 continues on 14.06; with two clear floors 2 yd apart
   within slope reach it still refuses. Change `slopeFloor` in `height.ts`.
3. **R2, mesh corner as hint.** Replace the two tests that pin the old rule
   (`accepts a mesh corner up to one climb and cell above the ground` and
   `walks the terrain line when the lost trace sits under a raised mesh
   corner`) with: a corner 8 yd above ground with no data near it plans; a
   corner above ground with a data surface within a climb of its z, where
   the walk is on the lower one, refuses; a corner below ground refuses.
   Change `meshCornerOnGround` in `swim.ts`.
4. **R3, mesh-routable destination floors.** Tests in `floors.test.ts` and
   `goto.test.ts`: two floors with one routable plans that floor with no
   `ambiguous_floor`; two routable refuse with only those floors listed
   (`refusalFloors`); none routable refuses; `floor_retry` in
   `travel-leg.test.ts` still replaces once. Change `planGround` and
   `destinationFloor` in `planner.ts`.
5. **Docs.** `docs/areas/travel.md` (the floor rules and the Silvermoon
   pocket), the travel row of `docs/harness.md`, and the `docs/capabilities.md`
   entry for `t4-objects-explore-fargodeep`.
6. **Offline replay.** Rerun the replay of the 85 legs and the 420-route
   battery before and after, and quote the counts in the PR.
7. **Live proof** below.

## Proof scenarios

Replica counts respect the cap of 3 graded runs per scenario for the issue.

| Scenario | Replicas | Passes needed | Proves |
| --- | --- | --- | --- |
| `t4-objects-explore-fargodeep` | 3 | 1 | Legs from inside the mine plan to trigger 88: no `path_corner_disagrees`, `no_ground` or `ambiguous_ground_column` row on a leg that starts below the mine entrance. Kobold interrupts used the whole budget in #445; if all three runs fail only on interrupts, report `blocked` with the scenario's fight allowance as the ruling |
| `t8-travel-fly` | 3 | 2 | The walk after landing in Silvermoon makes no `ambiguous_floor` retry that ends in `end_snapped_off`. The grader's window is 6 to 14 yd from the landing, and an `explore` leg is 20 yd: a point goto of ten yards passes, a first successful `explore` leg overshoots. Offline, every ten-yard goto from the landing plans on `main` and with the fix |
| `t1-walk-to-npc` | 2 | 2 | No regression on open ground: Goldshire to Marniel arrives |
| `t3-ghostlands-kill` | 2 | 1 | R3 on a map 530 column that `floor_retry` handled badly in round 701 (`ambiguous_floor` 6, `end_snapped_off` 5 in one run) |
| `t8-vehicles-drive` | 1 | 1 | R5: the Siege Tank goal with floors 7.7585 and 7.7437 no longer raises `ambiguous_floor` |

Each graded run is judged on its `nav/refused` rows as well as the
scenario's own checks, because a pass can hide a refusal the agent walked
around.

## Open points

- C4 stays refused. If the maintainer wants the stair base walkable, the
  choice is between trusting the mesh over collision data and rebuilding the
  mesh with a tighter detail error; both are outside this design.
- The 6 to 14 yd window of `t8-travel-fly` and the 20 yd `explore` leg are
  not navigation faults; they decide whether a navigation-clean run passes.
