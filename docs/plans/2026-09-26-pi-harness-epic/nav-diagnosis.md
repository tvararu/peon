# Navigation diagnosis: goto in Fairbreeze Village (eversong10)

> Record copy for the [Pi harness epic spec](../2026-09-26-pi-harness-epic-design.md),
> taken 2026-09-26 from the epic's scratch notes. `HANDOVER.md` (the
> coordinator's working notes) was not kept: its rulings R1-R38 are the
> spec's Decisions section. Paths under `~/.cache/pi-epic-scratch/`, and
> scratch files in the checkout's `tmp` directory other than the copies in
> this directory, were not kept. Wrapper, account and eval paths in that
> directory name outputs that the described tools write at run time.
> `src/...` paths before the workspace split now live under
> `packages/<pkg>/src/`.


Task key `nav`. Run 2026-09-26 on origin/main `5dca819`, scratch clone
`/home/deity/.cache/pi-epic-scratch/nav/clone`. Live server t1:3724,
throwaway account `FAC6AB822E4BF` (`soap create eversong10 --gm 2`),
deleted at the end. Evidence files (scripts, raw live logs, grids, diff):
`/home/deity/.cache/pi-epic-scratch/nav/evidence/`.

Marks: **measured** (command output in this run), **read** (code or doc
read), **inferred**.

Place name: the server's `.gps` at the preset square says
`Area: 3462 (Fairbreeze Village)` (**measured**). The spike report calls it
Falconwing Square. The NPCs are the same: Velan Brightoak, Halis
Dawnstrider, Magistrix Landra Dawnstrider, Marniel Amberlight, Ardeyn
Riverwind.

## Summary

1. **Environment, biggest effect.** Every soap account copies
   `navigation_library` from `~/.config/tuicraft/config.toml`
   (`src/factory/soap.ts:42-46,270`, **read**). That points at
   `/home/deity/wow-data/libnamigator.so`, dated 2026-07-05 (**measured**,
   `ls`). All three default patches in `vendor/namigator/` landed after
   that date (5b4896f is 2026-09-26). The spike and this account ran the **unpatched** library (#361 tested
   both builds; its refusal does not depend on the library) (daemon `/proc/<pid>/maps`
   shows `/home/deity/wow-data/libnamigator.so`, **measured**). Most
   `UNKNOWN_HEIGHT` refusals come from that library.
2. **Terrain height is lost on an exact tile corner next to the spawn.**
   Nearly every Detour path out of the spawn to the north passes the
   corner (8733.33, −6666.67), which is on a navmesh tile corner and an
   ADT chunk corner. `findHeights` there returns `[]`. The opt-in
   `adt-edges.patch` fixes it. The default patched build does not.
3. **`goto <guid>` drops the unit's observed Z** (`client-control.ts:139`).
   Every NPC in the square except Velan and Halis stands in a column with
   2 to 5 floors. So the guid form refuses with
   `ambiguous ground column at destination`, although the observed Z is
   0.08 to 0.10 yd above exactly one listed floor (#361).
4. **`start snapped off …` is a start pose off the eroded navmesh**, for
   example next to a vendor stall after the spike's straight-walk
   fallback. Such a refusal has no `nextStep`. A move of about 5 yd
   clears it (**measured** live).

Result with fixes 1+2+3 prototyped in the scratch clone: from the spawn,
**7 of 9 live guid gotos to NPCs arrived** (server `.gps` confirms the
pose), against **1 of the same 9 on the installed library**. With two
extra NPC-to-NPC runs, the total is 8 of 11. All five quest givers the spike
tried
(Velan, Halis, Landra, Marniel, Ardeyn) and Ranger Degolien arrive from
the spawn.

## 1. Reproduction (live, measured)

Runner: `evidence/live.sh <label> <start x y z> <goto args>`. It
teleports with `.go xyz … 530` (own GM account), waits 2.5 s, runs
`goto … --json`, polls `navigation --json` until `active` is false
(≤ 60 s), then reads `control --json`. Start = spawn (8735, −6685, 70.5),
except where the label says otherwise. NPC positions come from `nearby`
(**measured**): Velan (8755.61, −6690.05, 69.69), Halis (8731.69,
−6656.50, 70.67), Landra (8718.34, −6655.90, 72.84), Marniel (8700.38,
−6638.36, 72.83), Ardeyn (8703.90, −6633.56, 72.83), Sathiel (8682.65,
−6694.99, 73.22), Degolien (8716.27, −6622.22, 80.76), Jilanne (8713.83,
−6625.30, 93.53), Silvermoon Guardian (8704.85, −6652.93, 72.83).

### Pass A — installed library (reproduces the spike): 4/23 accepted

| # | goto | Result (`error.message`) | refusal | nextStep |
|---|---|---|---|---|
| A01 | Velan guid | accepted, arrived (8755.61, −6690.05, 69.60) | | |
| A02 | Halis guid | `stop: pathfind_find_height failed (UNKNOWN_HEIGHT)` | stop | "The planner lost the ground … Move about 10 yards …" |
| A03 | Landra guid | `pick_destination: ambiguous ground column at destination (floors 93.42, 72.75, 70.37)` | pick_destination | "… Repeat the goto with one of floors as Z …" |
| A04 | Landra xy z72.75 | UNKNOWN_HEIGHT | stop | move 10 yd |
| A05 | Marniel guid | ambiguous at destination (floors 104.94, 93.44, 82.70, 72.74, 70.37) | pick_destination | floors as Z |
| A06 | Marniel xy z72.74 | UNKNOWN_HEIGHT | stop | move 10 yd |
| A07 | Ardeyn guid | ambiguous at destination (same 5 floors) | pick_destination | floors as Z |
| A08 | Ardeyn xy z72.74 | UNKNOWN_HEIGHT | stop | move 10 yd |
| A09 | Sathiel guid | ambiguous at destination (94.73, 73.14, 70.78) | pick_destination | floors as Z |
| A10 | Degolien guid | ambiguous at destination (122.70, 93.45, 80.68, 71.41) | pick_destination | floors as Z |
| A11 | Degolien xy z80.68 | UNKNOWN_HEIGHT | stop | move 10 yd |
| A12 | Jilanne guid | ambiguous at destination (122.70, 93.45, 80.68, 71.18) | pick_destination | floors as Z |
| A13 | Guardian guid | ambiguous at destination (103.27, 93.44, 72.75, 70.35) | pick_destination | floors as Z |
| A14 | Red Dragonhawk Hatchling guid | ambiguous at destination (104.83, 93.44, 72.75, 70.37) | pick_destination | floors as Z |
| A15 | 8680 −6730 | UNKNOWN_HEIGHT | stop | move 10 yd |
| A16 | 8760 −6685 | accepted, arrived z 69.60 | | |
| A17 | 8850 −6685 | UNKNOWN_HEIGHT | stop | move 10 yd |
| A18 | 8740 −6750 81.8 | accepted, arrived | | |
| A19 | 8775 −6750 64.79 | UNKNOWN_HEIGHT | stop | move 10 yd |
| A20 | 8732 −6670 69.72 | accepted, arrived | | |
| A21 | from (8729.7, −6656.4, 70.6) → Landra xy z72.75 | `stop: start snapped off the requested ground position` | stop | **null** |
| A22 | from same pose → 8735 −6685 | start snapped | stop | **null** |
| A23 | Halis xy z70.67 | UNKNOWN_HEIGHT | stop | move 10 yd |

The refusal kinds match the spike's counts (UNKNOWN_HEIGHT, ambiguous at
destination, start snapped). Every refused goto left the pose unchanged.
The spike's "not on a ground floor" came from guessed Z values. It is
the correct refusal, with the right `floors`.

### Pass C — `adt-edges` build (`NAMIGATOR_ADT_EDGES=1`), no code change: 8/13

| # | goto | Result |
|---|---|---|
| C01 | Halis guid | accepted, arrived (8731.69, −6656.50, 70.59) |
| C02 | Landra guid | ambiguous at destination (floors 93.42, 72.75, 70.37), which is #361 |
| C03 | Landra z72.75 | arrived |
| C04 | Marniel z72.74 | arrived |
| C05 | Ardeyn z72.74 | arrived |
| C06 | Sathiel z73.14 | UNKNOWN_HEIGHT |
| C07 | Degolien z80.68 | arrived |
| C08 | Jilanne z93.45 | `stop: ground corridor changes surface`, nextStep **null** |
| C09 | 8680 −6730 | arrived z 81.02 |
| C10 | 8850 −6685 | UNKNOWN_HEIGHT |
| C11 | 8775 −6750 64.79 | arrived |
| C12 | Springpaw Stalker xy (8810.75, −6718.92) | arrived z 48.63 |
| C13 | from (8729.7, −6656.4, 70.6) → spawn | start snapped, nextStep null |

### Pass P — `adt-edges` build + guid floor pick prototype: 8/11 (7/9 from the spawn)

| # | goto | Result |
|---|---|---|
| P01 | Velan guid | arrived |
| P02 | Halis guid | arrived |
| P03 | Landra guid | **arrived** (72.75) |
| P04 | Marniel guid | **arrived** (72.74); server `.gps`: `X: 8700.38 Y: -6638.36 Z: 72.74432 … FloorZ: 72.74432`, `nearby` 0.08 yd |
| P05 | Ardeyn guid | arrived |
| P06 | Sathiel guid | UNKNOWN_HEIGHT |
| P07 | Degolien guid | arrived (80.68) |
| P08 | Jilanne guid | ground corridor changes surface |
| P09 | Silvermoon Guardian guid | arrived (72.75) |
| P10 | from Halis → Landra guid | `ambiguous ground column at route` |
| P11 | from Landra → Marniel guid | arrived |

Stuck-pose recovery (live, `adt-edges`): `.go` to (8729.7, −6656.4, 70.6),
`face 4.895`, `move forward 700` → pose (8730.59, −6661.22, 70.33). Then
`goto 8735 -6685`, `goto 8718.34 -6655.90 72.75` and
`goto 0xf130003c390005eb` were each accepted and arrived (**measured**).

52 live goto attempts in total: A 23, C 13, P 11, 3 after the stuck-pose
recovery, 1 warm-up and 1 `.gps` verification.

## 2. Offline reproduction and grid (measured)

`evidence/probe.ts` calls `createNavigation().plan/planGround` with the
same poses. It gives the same result as live for every case in passes
A and C, so the planner alone decides these refusals. The server does
not take part.

Grid, `vendor/namigator/measure.ts <lib> 8735,-6685,70.5 grid 120 6`
(1681 `planGround` destinations from the eversong10 spawn):

| Result | installed (Jul 5) | default patched | + adt-edges |
|---|---:|---:|---:|
| OK | 352 | 910 | **1132** |
| `pathfind_find_height failed (UNKNOWN_HEIGHT)` | 1100 | 483 | 169 |
| `ambiguous ground column at destination` | 200 | 200 | 200 |
| `ambiguous ground column at route` | 0 | 56 | 57 |
| `path corner disagrees with connected ground` | 0 | 3 | 61 |
| `end snapped off the requested ground position` | 27 | 27 | 27 |
| `ground corridor changes surface` | 0 | 0 | 24 |
| `ground corridor collision` | 0 | 0 | 10 |
| other | 2 | 2 | 1 |

Monotonic: all 352 installed-OK routes stay OK with the default build,
with the same point hash. All 910 default-OK routes stay OK with
adt-edges, and 909 of them keep the same hash. One route changes its
points (edge heights, see the risk below).

## 3. Trace per refusal kind

### 3a. `pathfind_find_height failed (UNKNOWN_HEIGHT)`

Code path (**read**): `planRoute` (`navigation.ts:205`) → `findPath`
succeeds → straight `GroundRoute([from,to])` fails with a ground error
and is caught (`:220-224`) → corridor `GroundRoute(corridor,
WALKABLE_CLIMB)` → `groundPath`/`stepCorner` walk every 0.5 yd →
`groundPoint` (`:309`) → `map.findHeight(from, x, y)` or the back check
`findHeight(point, from.x, from.y)` → `NamigatorMap.findHeight`
(`navigation-native.ts:233-250`) throws `groundError(... UNKNOWN_HEIGHT)`.
Native `Map::FindHeight` returns false when: `findNearestPoly` (1 yd
extents) finds no poly for the source, the raycast leaves the mesh before
the target, `getPolyHeight` rejects the target, or `FindNextZ` finds no
surface (namigator `pathfind/Map.cpp:817-863` upstream, **read**).

Instrumented trace (`evidence/trace.ts` wraps the `NativeMap` through
`createNavigation`'s `openMap` argument). The failing calls are:

- **Class A, tile corner with no terrain (the main one).** Default
  patched build, spawn → Halis, Marniel, Ardeyn and Sathiel with the floor as Z
  (the traced set): the corridor call that fails is
  `findHeight from (8733.38,-6667.16,69.83) -> (8733.33,-6666.67)
  heightsAtTarget=[]`. Detour's path corner is (8733.33, −6666.67,
  69.93). 8733.33 = 131 × 66.667 and −6666.67 = −100 × 66.667, so it is a
  navmesh tile corner and an ADT chunk corner (**measured** coords,
  **inferred** geometry). `GetADTHeight` loses the point on the quad
  edge, and `findHeights` is empty. This is the "terrain lost on a quad
  or tile edge" class that `docs/evidence/m3a/patched-namigator.md:204-245`
  describes, and `adt-edges.patch` fixes it. Every route from the spawn
  to the north of the square goes through this corner. That is why
  "walk to a quest giver" failed every time.
- **Class B, ray along a step or border edge.** adt-edges build, spawn →
  8850 −6685: `findHeight from (8768.75,-6683.18,70.13) ->
  (8769.05,-6683.33) heightsAtFrom=[69.18,70.13]
  heightsAtTarget=[69.11,70.20]`. It happens on a 1 yd step with two
  surfaces. This is the float-degeneracy family that the m3a doc left
  unfixed.
- **Class D, source off the navmesh at its height.** adt-edges, spawn →
  Sathiel z73.14: `findHeight from (8700.30,-6695.54,70.70) ->
  (8700.74,-6695.54) heightsAtFrom=[70.70]`. Detour's corner there is at
  73.11 (a doorstep 2.25 yd above terrain over 0.9 yd, the inn door
  **inferred**). The collision column has only 70.70, so the walker drops
  to terrain, and `findNearestPoly` with ±1 yd finds no poly. A
  data/mesh mismatch. The doc calls this refusal correct.
- On the **installed** library the same routes fail earlier on many more
  boundary rays. That is the pre-`boundary-rays.patch` behaviour
  (1100/1681 UNKNOWN_HEIGHT on the grid).

### 3b. `ambiguous ground column at destination` (guid form)

`navigateTo` (`client-control.ts:128-160`, **read**) turns a guid into
`{x, y}` from `rt.observedTarget(guid)`, which returns a full `NavPoint`
with z (`runtime.ts:51`). The code discards that z. `planDestination` →
`planGround` → `destinationFloor` (`navigation.ts:367-375`) refuses when
`groundFloors` has more than one entry. Observed NPC Z against listed
floors (**measured**): Landra 72.84/72.75, Marniel 72.83/72.74, Ardeyn
72.83/72.74, Sathiel 73.22/73.14, Degolien 80.76/80.68, Jilanne
93.53/93.45, Guardian 72.83/72.75, Halis 70.67/70.59, Velan 69.69/69.60.
The offset is always 0.08 to 0.10 yd, and exactly one floor is within
`GROUND_ERROR` (0.25). The square sits under tree platforms at 93 to 105
and a terrace at 80 to 83, so nearly every column in it has several
floors (200/1681 grid destinations).

### 3c. `start snapped off the requested ground position`

`planRoute` → `rejectSnap("start", from, points[0])`
(`navigation.ts:216,508-525`, **read**). It allows only float rounding in
xy and `GROUND_ERROR` in z. `findPath` snaps a start that lies outside
the navmesh (eroded by the agent radius around doodads such as stalls,
crates and the NPC's own spot) onto the nearest poly. At the spike's
stuck pose, `findPath` begins at (8729.70, −6656.55, 70.73) instead of
(8729.7, −6656.4, 70.6) (**measured**, rounded input pose). The pose is
2 yd west of Halis's stall. The spike reached it with the round-4
straight-walk fallback (`walkToward`), which does not follow the mesh.

Frequency (`evidence/snap.ts`, adt-edges build, every ground pose at
69 to 74 on a 1 yd grid ±30 yd around (8725, −6660), routed to (8760,
−6685, 69.6)): 194 of 3401 poses (5.7 %) refuse with start snapped. The
snap-distance quantiles are 0.00/0.10/0.23/0.45/1.03/2.14 yd.
`control-drive` sets `navigationError` with this reason, and
`nextStepFor` has no branch for it, so `nextStep` is `null`
(`navigation-observation.ts:8-44`, **read**; live A21/A22/C13).

### 3d. `ground corridor changes surface` (Jilanne, hatchlings at z 93)

The path climbs a long ramp to the tree platform. `groundPoint`'s back
check (`navigation.ts:318-320`) finds another surface. Not pursued. It is
not a quest giver path. `nextStep` is null for it too.

### 3e. `ambiguous ground column at route` (Halis → Landra, P10)

The route passes under the terrace edge. This is the #350/#315 family
(per-sample `WALKABLE_CLIMB` against Recast's voxel climb). Not traced
further.

## 4. Root-cause classes

| Cause | Kind | Refusals it explains | Who fixes |
|---|---|---|---|
| Soap accounts run the July unpatched library | environment | most spike UNKNOWN_HEIGHT | ops: rebuild and install, or soap points at `tmp/namigator` |
| Terrain height lost on ADT quad/tile edges (corner 8733.33, −6666.67) | data lookup in namigator `GetADTHeight` | UNKNOWN_HEIGHT on every route north of the spawn, even with default patches | core: make `adt-edges.patch` default |
| guid form ignores observed Z | client logic, target resolution | ambiguous-at-destination for 7 of 9 NPCs | core: floor pick (#361) |
| Start pose off the eroded mesh | client logic (snap threshold) + server pose from straight walks | start snapped, stuck agent | core: nextStep now; snap budget is weak (below). Harness: avoid straight-walk fallback near objects |
| Doorstep / step edges, ray degeneracies | data (collision vs mesh) and Detour float edges | Sathiel, 8850, P10 | open (#350, m3a B/C/D) |
| Preset start pose (8735, −6685, 70.5) | server pose | none: it passes `checkStart` and plans to Velan and open ground on every library | not a cause |
| Guessed Z values | harness/agent | "not on a ground floor" | harness: never guess Z, pass unit Z or floors |

## 5. Proposed fixes, ordered by effect on "walk to an NPC in a town"

### F1. Run the patched library for every account (no code in `src/`)

- **Change:** rebuild with `mise namigator:build` (plus F2) and install it
  at `/home/deity/wow-data/libnamigator.so`. The other option is to make
  `soap create` write `navigation_library` from the repository build
  (`tmp/namigator/libnamigator.so` of the main checkout) instead of
  copying the maintainer's config. It could also refuse when that file
  is older than `vendor/namigator/*.patch`.
- **Evidence:** grid OK 352 → 910 (default) → 1132 (+ADT). Live pass C
  8/13 against pass A 4/23. No route that planned before stops planning.
  **F1 alone is not enough for the NPC loop.** The default build reaches
  Velan, Landra with Z and open ground. Every other route north of the
  spawn still stops on the (8733.33, −6666.67) corner, so F1 needs F2.
- **Risk:** low. The patches are already on `main` and measured
  (`docs/evidence/m3a/*.md`). Replacing a shared file changes every
  running daemon's next `dlopen` only after restart.
- **Regression test:** a staleness check in `soap create`: it warns or
  fails when `navigation_library` does not export the expected build or
  is older than the patches. Plus a live gate: "goto each quest giver in
  Fairbreeze Village from the eversong10 spawn".

### F2. Make `adt-edges.patch` a default patch

- **Change:** `vendor/namigator/build.sh` applies `adt-edges.patch`
  always.
- **Evidence:** the default build still refuses Halis, Marniel, Ardeyn,
  Sathiel and Degolien with UNKNOWN_HEIGHT (offline). The trace puts
  Halis, Marniel, Ardeyn and Sathiel on the tile corner (8733.33,
  −6666.67). With adt-edges all of them arrive live (C01, C03 to
  C05, C07). Grid +222 OK (910 → 1132), 0 regressions to refusal.
- **Risk:** it changes heights that already succeeded at quad edges.
  That is why the m3a doc kept it opt-in. Here 1 of 910 routes changes
  its points. The PR #155 review found the new heights match points
  0.02 yd away. New refusal kinds appear on the grid (`path corner
  disagrees` 3 → 61, `corridor changes surface` 0 → 24). All of them were
  UNKNOWN_HEIGHT before, so none is a regression, but the next-step text
  must cover them (F4).
- **Regression test:** extend `vendor/namigator/measure.ts` or an offline
  fixture test that asserts `findHeights(8733.33, -6666.67)` is non-empty
  and spawn → (8731.69, −6656.50) plans. Rerun the m3a Fairbreeze and
  Sunstrider grids, which must hold hashes for previously OK routes.

### F3. `goto <guid>` picks the floor from the unit's observed Z (#361)

- **Change** (prototype, `evidence/guid-floor.diff`, **measured** to
  typecheck and pass `client-control`, `control-navigation` and
  `commands-dispatch-control` tests, 25/25): keep `z` from
  `rt.observedTarget(guid)`. When `planDestination` throws a floor error,
  and exactly one listed floor is within 0.25 yd of the observed Z,
  replan with that floor as Z. Otherwise rethrow the original refusal.
  ```ts
  const near = floors.filter((f) => Math.abs(f - observedZ) <= UNIT_FLOOR);
  if (near.length !== 1) throw error;
  return planDestination(navigation, pose, { ...destination, z: near[0] });
  ```
  A cleaner version passes the hint into `planGround` and
  `destinationFloor`. The replan route (`navigate` callback) already uses
  `resolved`, which then carries the floor.
- **Evidence:** live pass P: Landra, Marniel, Ardeyn, Degolien and the
  Guardian go from `pick_destination` to arrived. Server `.gps` confirms
  Marniel at FloorZ 72.744.
- **Risk:** low. It uses only observed data and keeps the refusal when
  two floors are near. The `floors` text in the manual and in
  `SKILL.md` must say that the guid form now resolves the floor. A unit
  that flies or swims above a floor (more than 0.25) still refuses.
- **Regression test:** `client-control.test.ts`: a fake navigation whose
  `planGround` throws a floor error with floors [93.42, 72.75, 70.37] and
  an observed unit at z 72.84 expects a `plan` call with z 72.75. A unit
  at 80.0 expects the original refusal. Two floors within 0.25 also
  expect the refusal.

### F4. Give `start snapped off` (and `ground corridor changes surface`) a nextStep

- **Change:** `nextStepFor` in `navigation-observation.ts` gets: "The
  current position is off the walkable mesh, for example against an
  object or an NPC. Move 3–5 yards into open ground with face and move
  forward, then plan again. Do not repeat this goto from here." Also add
  a line for `ground corridor changes surface`.
- **Evidence:** live, a 700 ms forward move (about 5 yd) from the spike's
  stuck pose made three following gotos succeed. The spike agent had
  `nextStep: null` and stayed stuck for 6 calls.
- **Risk:** none. Text only.
- **Regression test:** `navigation-observation.test.ts` case for the
  reason string.
- **Not recommended:** accepting a start snap of ≤0.5 yd in `rejectSnap`.
  Measured on the 1 yd grid: of 194 snapped starts, 0 then plan. 95 turn
  into UNKNOWN_HEIGHT because the corridor walk still starts from the
  off-mesh pose. Replanning from the snapped point itself plans 80 of 194
  (69 of 146 ≤0.5 yd, `evidence/snap2.ts`). That would need a
  pose → snap leg that the drive walks unchecked, so it is weaker than
  F4 plus a small move. It could be revisited as an automatic "step to
  mesh" once F1 to F3 are in.

### F5. Harness-side avoidance (now, no core change)

- Pass the unit's Z: goto `x y z` with the listed floor nearest the
  unit's `nearby` Z when the guid form returns `pick_destination` with
  `floors`. Pick only when one floor is within 0.25. This is F3 done in
  the harness.
- Never invent Z. Use only `floors` from a refusal.
- Remove the straight-walk fallback near objects, or bound it to open
  ground. It produced the stuck pose. On `start snapped`, move 3–5 yd
  toward the last good pose (or away from the nearest unit), then retry.
- Stand-off: route to a point 2 to 3 yd short of an NPC on the same floor
  only when the NPC's own column refuses. Talk range is 5, and the P
  runs ended 0.00 to 0.08 yd from the NPC, which works for talk.

### Still open after F1 to F3 (outside the quest-giver loop)

Sathiel (inn doorstep, class D), long east route 8850 −6685 (class B
step edge), Jilanne and the hatchlings on the platform at 93 (corridor
changes surface), Halis → Landra (ambiguous at route, #350 family).

## Cleanup

- Scratch clone only. `src/wow/client-control.ts` in the clone holds the
  F3 prototype, and `navigation.ts` was restored after the snap
  experiment (`git status` in the clone). No tracked file in
  `/home/deity/code/tuicraft` changed. This report is the one file
  written there.
- The account was deleted, and the delete result is logged at the end of
  the run (see below).

- `bun src/factory/main.ts soap delete FAC6AB822E4BF` → `{"deleted":["FAC6AB822E4BF"]}` (**measured**).

## Challenge

Adversarial review, same day, same scratch clone
(`/home/deity/.cache/pi-epic-scratch/nav/clone`, HEAD `5dca819` =
origin/main). New own account `FAC6AB827FCC0` (`soap create eversong10
--gm 2`), deleted at the end: `soap delete FAC6AB827FCC0` →
`{"deleted":["FAC6AB827FCC0"]}` (**measured**). Challenge scripts are in
the clone as `tmp/ch-*` (not kept) (`ch-probe.ts`, `ch-m3a.json`, `ch-h2.ts`,
`ch-live*.txt`, `ch-swap.sh`), plus a fourth library build,
`tmp/namigator-clamp/` (not kept) (default patches + only the quad-index clamp from
`adt-edges.patch`).

### Live re-runs (6 reproductions + 1 recovery, all measured)

Runner: the report's `evidence/live.sh` with my account. For every run I
read `/proc/<daemon pid>/maps` after the goto; the mapped library is the
one named in the label.

| # | Library | Code | goto | Result | Matches |
|---|---|---|---|---|---|
| R1 | installed | main | Halis guid | `stop: pathfind_find_height failed (UNKNOWN_HEIGHT)`, "move 10 yd" nextStep, pose unchanged | A02 |
| R2 | installed | main | Landra guid | `pick_destination: ambiguous ground column at destination (floors 93.42, 72.75, 70.37)` | A03 |
| R3 | installed | main | from (8729.7, −6656.4, 70.6) → Landra xy z72.75 | `stop: start snapped off the requested ground position`, nextStep null | A21 |
| R3b | installed | main | then `face 4.895`, `move forward 700` → (8730.59, −6661.22, 70.33), `goto 8735 -6685` | accepted, arrived, `remaining 0` | recovery; also works on the **installed** library, not only adt-edges |
| R6a | default patched | main | Halis guid | UNKNOWN_HEIGHT | F1 alone does not reach Halis |
| R6b | default patched | main | Landra xy z72.75 | arrived (8718.34, −6655.90, 72.75) | F1 alone reaches Landra with Z |
| R4 | adt-edges | main | Halis guid | arrived (8731.69, −6656.50, 70.59) | C01 |
| R5 | adt-edges | F3 prototype | Landra guid | arrived; `.gps` `X: 8718.34 Y: -6655.9 Z: 72.754585`, Area 3462; `nearby` 0.08 yd | P03 |

The soap config copies `navigation_library =
"/home/deity/wow-data/libnamigator.so"` from the maintainer config
(**measured**: the new account's `config.toml` line 10, and the daemon's
maps before I swapped it).

### Offline replay (measured)

`tmp/ch-probe.ts` (not kept) over all 28 cases of `cases.json` + `cases2.json` on
the three libraries gives exactly the report's pass A / C results and
its "default build" statements.

### What holds

1. **Environment (§4 row 1).** Holds as read and measured: soap copies the
   July 5 library, the main checkout has no `tmp/namigator*/libnamigator.so`
   at all (`/usr/bin/find /home/deity/code/tuicraft/tmp -maxdepth 3 -name libnamigator.so` prints nothing, **measured**), and every M3a live record also ran on the
   installed library (`docs/evidence/m3a/README.md` header, **read**).
   But "biggest effect" is true only for the grid (352 → 910 OK). For the
   quest-giver loop it is not: on the default build only Velan and
   Landra-with-Z plan; Halis, Marniel, Ardeyn and Degolien still stop
   (R6a live, offline for the rest). For the NPC task, class A (F2) is the
   biggest single effect.
2. **Grid monotonicity.** Recomputed from `evidence/grid-*.json`:
   installed → default loses 0 OK routes and changes 0 hashes; default →
   adt loses 0 and changes 1 hash. Every new refusal kind on adt-edges
   (58 `path corner disagrees`, 24 `corridor changes surface`, 10
   `corridor collision`, 1 `ambiguous at route`) was UNKNOWN_HEIGHT on the
   default build (**measured**, `tmp/ch-grid.ts` (not kept) in the clone). The report's
   "3 → 61" is the total count; 58 are new.
3. **Class A mechanism.** The report's explanation (rounding puts the
   point outside all four triangles) holds against the simpler candidate I
   tried. `adt-edges.patch` also clamps an out-of-bounds quad index
   (index 8 on a tile's south/east edge). A clamp-only build gives exactly
   the default build's result: `findHeights` is `[]` on the default and clamp
   builds (probed at y = −6666.666 with x = f32(8733.333), 8733.333 and 8733.3334), and
   non-empty on adt-edges (`tmp/ch-h2.ts` (not kept), **measured**). The clamp-only build also refuses
   Halis, Marniel, Ardeyn and Degolien with UNKNOWN_HEIGHT, exactly like the default build
   (`tmp/probe.ts` (not kept) with `tmp/ch-trace.json` (not kept), **measured**). So the plane-height fallback, not the clamp, is what fixes this corner. The
   clamp is still worth keeping: it removes a Release-mode out-of-bounds
   read.
4. **Corner trace.** The default-build corridor failure is
   `findHeight from (8733.38,-6667.16,69.83) -> (8733.33,-6666.67)
   heightsAtTarget=[]` for Halis, Marniel, Ardeyn **and Degolien**
   (**measured**, `tmp/trace.ts` (not kept)).
5. **F3 guid Z drop.** `client-control.ts:139` reads only `{ x, y }`
   (**read**). `floorError` is used only at `navigation.ts:364,373`
   (destination errors), so the prototype cannot pick a floor from a route
   or start refusal (**read**). The replan callback reuses `resolved`, so
   it keeps the picked floor (`client-control.ts:147`, **read**).
6. **Start snap mechanism.** `rejectSnap` allows only f32 rounding in xy
   (`navigation.ts:508-525`, **read**). Live R3 and offline both refuse.
   `nextStepFor` has no branch for it (`navigation-observation.ts:8-36`,
   **read**).

### What does not hold, or is overstated

1. **Sathiel is not a corner case.** §3a and F2 put Sathiel on
   (8733.33, −6666.67). On the default build its corridor fails at
   `(8700.30,-6695.54) -> (8700.74,-6695.54) heightsAtFrom=[70.70]`, the
   class D doorstep. It fails the same way on adt-edges (C06, P06). No build
   fixes Sathiel. Degolien is the fourth corner case, not Sathiel.
2. **"Every route north of the spawn passes the corner" is too strong.**
   Spawn → Landra xy z72.75 plans on the default build, offline and live
   (R6b), and spawn → 8680 −6730 and → Springpaw Stalker also plan on the
   default build. Four of the five traced NPC routes use the corner. That
   is enough for the argument.
3. **Geometry wording.** `Common.hpp:20,65-69`: `TilesPerChunk = 1`, so
   a navmesh tile is an ADT chunk of 33.333 yd. The corner is
   262 × 33.333 and −200 × 33.333. "131 × 66.667" has the right number and
   the wrong unit. The conclusion (tile and chunk corner) holds.
4. **"NPC's own spot" erodes the mesh (§3c, F4 text).** It does not. The
   navmesh is built from terrain, WMOs and doodads only, with
   `WalkableRadius = 0.3` (`Common.hpp:28`, **read**). Creatures are not
   in it (**inferred** from the builder inputs). The stuck pose sits next
   to Halis's stall doodad. The F4 text must say "an object or a
   building", not "an NPC". Snap distances up to 2.14 yd are larger than
   the 0.3 yd erosion. Those poses stand on geometry that the mesh does
   not cover, not on an eroded edge (**inferred**).
5. **The F3 prototype does not pass the gate.** With the diff applied,
   `mise typecheck` and `mise test` pass (2485/2485), but `mise lint`
   fails: `client-control.ts:131:33 lint/suspicious/noShadow` (`floor`
   inside the filter shadows `const floor`) (**measured**). "25/25" in the
   report covered 3 files only. Also, `UNIT_FLOOR = 0.25` duplicates
   `GROUND_ERROR` from `navigation-collision`. Use that constant.
6. **Not checked by me:** the spike's 6 stuck calls and the claim that
   `walkToward` produced the stuck pose. They come from the spike report,
   not from this run.

### Side effects on M3/M3a behaviours

Offline replay of every route that `docs/evidence/m3a/README.md` records
live, on installed / default / adt-edges (`tmp/ch-m3a.json` (not kept),
**measured**; `h` = hash of the route points):

| M3a record | installed | default | adt-edges |
|---|---|---|---|
| slice 1, exit → 8764.71 −6683.07 | OK `fdc7852963dca83` | same | same |
| slice 1 re-proof, → 8764.71 −6683.07 | OK `7a96956fd984a57b` | same | same |
| slice 1, → inn 8714.14 −6650.33 | pick_destination (4 floors) | same | same |
| slice 4, A → B | OK `5d473c886593f27e` | same | same |
| slice 4, B → A | OK `f8301e717570879a` | same | same |
| slice 4, redirect → 8744.35 −6687.06 | OK `159b886b3a9b4ed7` | same | same |
| slice 5, → 8667.46 −6773.76 | UNKNOWN_PATH (unreachable) | same | same |
| slice 5, → 8727.46 −6683.76 | end snapped (unreachable) | same | same |
| slice 5, stalker route | OK `18de9c23b397f044` | same | same |
| funnel corner → 8722.99 −6666.06 | OK `bf24a9d7fc925830` | same | same |
| #361, → 8721 −6660 72.34 | OK `37e10345edfc633` | same | same |
| slice 1, exit → 8764.71 −6648.63 | UNKNOWN_HEIGHT | OK | OK (same hash) |
| slice 1, inn start → 8755.71 −6687.55 | `ambiguous ground column leaving start` | OK | OK (same hash) |

- **F1 + F2:** no recorded route changes its points and every recorded
  refusal (unreachable, end snapped, ambiguous at destination) stays.
  Two installed-library refusals now plan: the slice 1 funnel gap, which
  roadmap 3a slice 2 wants closed, and the inn-start refusal. The #138 rule
  in `m3a/README.md` already expects the latter. The M3a transcripts
  describe the installed library. After F1 they are historical evidence,
  so a new live re-proof on the new library is needed before M3a claims
  depend on it.
- **F2 extra risk:** `GetADTHeight` feeds `ZoneAndArea` and
  `navigation.height` and `navigation.stepHeight`, which `walkToward`'s
  destination and `self_not_grounded` check (`client-control.ts:44,46,63`) and the
  manual-move step heights (`runtime.ts:94-95`) use (**read**). Nothing in the grid measures those
  paths. Heights change only at quad edges (0.02 yd per the PR #155
  review), so the risk is low, but it is not measured. It also reverses
  the #151 acceptance criterion, which `patched-namigator.md` records.
  That needs a maintainer ruling, not only a PR.
- **F3:** only the guid form changes. The coordinate-form
  `pick_destination` contract (slice 1, `client-control.test.ts:89`
  "refuses an ambiguous column at pick_destination with its floors") is
  unchanged, and no test encodes a guid refusal on a multi-floor column
  (`rg`, **read**). Slice 5 guid routes (stalker, unique column) take the
  first `planDestination` branch and are not affected. It is a policy
  change against the reviewed rule "deriving destination Z from a unique
  native column" (roadmap 3a). Record it as a decision and update
  `docs/manual.md` and `SKILL.md`.
- **F4:** text only, no behaviour change.

### Recommended fix order

1. **F4 now** (nextStep for `start snapped` and `ground corridor changes
   surface`, without "NPC" in the text). No dependency, no risk.
2. **F3 now**, after the lint fix and with `GROUND_ERROR`. It is pure
   `src/wow` code, testable with a fake navigation, and independent of the
   library. On any library it turns the guid refusal into the correct
   floor. With the installed library that floor then usually stops on
   UNKNOWN_HEIGHT, so F3 alone does not make the loop work.
3. **F1 + F2 as one ops-and-vendor change**, gated on a maintainer ruling
   on #151, on the grid (0 OK→refusal, 1 hash change) and on the M3a
   replay table above. Then a live re-proof of the M3a slices on the new
   library. F1 without F2 gains nothing for the quest givers except
   Landra-with-Z. Pick the variant where `soap create` builds or points
   at a repository build, and refuses a library older than
   `vendor/namigator/*.patch`. Pointing soap at the main checkout's
   `tmp/namigator` needs a `mise namigator:build` there first, because
   no build exists.
4. **Still open after all four:** Sathiel (class D doorstep, every build),
   8850 −6685 (class B step edge), Jilanne and the hatchlings at z 93
   (corridor changes surface), and Halis → Landra (ambiguous at route).
