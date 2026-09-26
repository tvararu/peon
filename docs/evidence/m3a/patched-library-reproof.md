# M3a: live re-proof on the patched library

2026-09-26, branch `epic/nav-track` at `305acf6`. Own throwaway account
`FAC6AB82C47EE` (`soap create eversong10 --gm 2`), deleted after the run.
`soap create` wrote `navigation_library =
"/home/deity/.local/share/tuicraft/namigator/70310c603ad64bc1/libnamigator.so"`,
the four-patch build from `mise namigator:build`, and the daemon's
`/proc/<pid>/maps` showed that file. Transcript:
[patched-library-reproof-transcript.txt](patched-library-reproof-transcript.txt).

Each run teleports with `.go xyz <start> 530`, waits 2.5 s, runs
`goto … --json`, polls `navigation --json` until `active` is false and reads
the final pose from `control --json`.

## M3a README routes

The routes of slices 1, 4 and 5 in the [M3a README](README.md), each from
its recorded start, plus two other Fairbreeze routes:

| Route | Result in the M3a README | Live now |
|---|---|---|
| slice 1, inn start → 8755.71 −6687.55 | `stop: ambiguous ground column at start` | arrived |
| slice 1, → 8764.71 −6648.63 | `UNKNOWN_HEIGHT` | arrived |
| slice 1, exit → 8764.71 −6683.07 | arrived | arrived, z 69.79 |
| slice 1, → inn 8714.14 −6650.33 | `pick_destination` | same refusal, floors 102.01, 93.44, 72.75, 70.37 |
| slice 1 re-proof, → 8764.71 −6683.07 | arrived | arrived |
| slice 4, A → B and B → A | arrived | both arrived |
| slice 4, redirect target 8744.35 −6687.06 | arrived after a mid-route redirect | arrived as a single goto |
| slice 5, → 8667.46 −6773.76 | `unreachable` (`UNKNOWN_PATH`) | same |
| slice 5, → 8727.46 −6683.76 | `unreachable` (end snapped) | same |
| slice 5, stalker route → 8822.03 −6784.36 | `goto <guid>`, stopped `target_lost` by the GM | coordinate goto to that position, arrived, z 43.29 |
| A (8709.46 −6671.76) → funnel corner point 8722.99 −6666.06 | not recorded | arrived |
| issue #361, spawn → 8721 −6660 72.34 | not recorded | arrived |

The slice 4 redirect and the slice 5 `target_lost` stop are behaviours of
the route, and this run does not repeat them. Every refusal left the pose
unchanged.

## Routes not re-run

These M3a records name routes that this run does not repeat on the patched
library:

- [funnel-corner.md](funnel-corner.md): the recorded route
  (8709.46, −6671.76) → (8801.13, −6550.23) through the corner. The gap in
  the roadmap's slice 2 stays open.
- [replanning.md](replanning.md): the C → B and D → B replanning runs.
- The Sunstrider Isle routes in [sunstrider-floors.md](sunstrider-floors.md),
  [step-edges.md](step-edges.md), [ground-policy.md](ground-policy.md) and
  [findheight-surface-above-hint.md](findheight-surface-above-hint.md).

## `goto <guid>` from the spawn (8735, −6685, 70.5)

7 of 9 arrived on the floor under the NPC: Velan (z 69.60), Halis (70.59),
Landra (72.75), Marniel (72.74), Ardeyn (72.74), Ranger Degolien (80.68)
and the Silvermoon Guardian (72.75). Sathiel refused with `UNKNOWN_HEIGHT`
(the inn doorstep) and Jilanne with `ground corridor changes surface` (the
ramp to the platform at z 93), each with its `nextStep`.

## Snapped start

From (8729.7, −6656.4, 70.6), `goto 8735 -6685` refused with
`start snapped off the requested ground position`, `refusal=stop`, and the
new `nextStep` ("The current position is off the walkable mesh, …").
