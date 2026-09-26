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

## M3a recorded routes

Every route that the M3a live records name, from its recorded start:

| Route | Offline replay on the old library | Live now |
|---|---|---|
| slice 1, inn start → 8755.71 −6687.55 | `ambiguous ground column leaving start` | arrived |
| slice 1, → 8764.71 −6648.63 (funnel gap) | `UNKNOWN_HEIGHT` | arrived |
| slice 1, exit → 8764.71 −6683.07 | arrived | arrived, z 69.79 |
| slice 1, → inn 8714.14 −6650.33 | `pick_destination` (floors 102.01, 93.44, 72.75, 70.37) | same refusal |
| slice 1 re-proof, → 8764.71 −6683.07 | arrived | arrived |
| slice 4, A → B and B → A | arrived | both arrived |
| slice 4, redirect target 8744.35 −6687.06 | arrived | arrived |
| slice 5, → 8667.46 −6773.76 | `unreachable` (`UNKNOWN_PATH`) | same |
| slice 5, → 8727.46 −6683.76 | `unreachable` (end snapped) | same |
| slice 5, stalker route → 8822.03 −6784.36 | arrived | arrived, z 43.29 |
| funnel corner → 8722.99 −6666.06 | arrived | arrived |
| #361, → 8721 −6660 72.34 | arrived | arrived |

The slice 4 redirect ran as a single goto to the redirect target, not as a
mid-route redirect. Every refusal left the pose unchanged.

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
