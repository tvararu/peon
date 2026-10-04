# Jev pilot: Jev steers the character

Date: 2026-10-04. Status: design for the first slice.
Item 7 in the maintainer's notes. #531 (off-mesh starts) lands first as its
own fix.

Question: can Jev drive movement itself, choosing what to press several
times a second the way a driver keeps nudging the wheel, instead of only
picking combat actions inside `engage`?

## Decision

Add a closed control loop called the **pilot**. Each tick runs four steps:

1. **Perceive**: code builds a small frame relative to the character from the
   control state and namigator.
2. **Decide**: Jev picks one option from a Choice.
3. **Act**: code applies the chosen input.
4. **Check**: the next frame shows what the input did.

The calls run back to back, so a new decision follows as soon as Jev answers
(about 4 a second at the measured 210–260 ms p50). The agent starts the pilot
with a new `pilot` tool that takes an objective. Jev makes every movement
decision until the objective is met, a human takes over, or the run stops.

The slice covers walking objectives only: reach a point, run a circle, and
get over low obstacles by jumping. Layering movement with combat (kiting)
and inferred aggro envelopes come next, on the same loop.

## Prior art

Sources are listed at the end. What carries over:

- **Small, mutually exclusive actions with a safe default.** Every working
  system in the survey bounds the model to a small executable set: SIMA 2
  emits key chunks, Cradle uses skills, a WoW VLM bot uses about 10 keys, and
  Kotoko uses 378 bundles behind a confidence fallback.
- **Geometry in code, not in the model.** Cradle's failures were perception
  failures: blocked detection, direction and relative position. TypeSafe's
  jev-1.13 notes say the same of Jev: it is "not a calculator", reads
  literally, and does better with computed values or named buckets than with
  raw numbers.
- **Context steering** (Fray, Game AI Pro 2 ch. 18) splits the work into
  danger and interest per heading slot. Code masks the dangerous slots and the
  chooser trades off interest among the safe ones. A Choice over pre-masked
  heading options is exactly that shape.
- **Commit and re-confirm.** Diffusion Policy and ACT commit to short action
  chunks to avoid flipping between modes. Nav2's velocity smoother holds the
  last command and zeroes it after a timeout (1.0 s in its example). The pilot
  keeps the last input only until the next decision, and a dead-man timeout
  zeroes it.
- **Jumps are links with preconditions** (Unity off-mesh links, Recast jump
  links): an obstacle low enough, a clear arc and walkable ground at the
  landing. Momentum is fixed once airborne, so the decision has to come before
  the obstacle.

No published system closes a loop around a hosted choice model at about 4 Hz,
so the live evals below are the evidence.

## The loop

The pilot reuses `TacticsLoop` (`packages/harness/src/loops/tactics.ts`): its
observe, select, re-observe, availability check and execute steps, its
staleness discard and its `jev.jsonl` events. It runs as a second instance
with a `PilotActions` port (observe, execute), with these settings:

- `minIntervalMs: 50`. The next call starts as soon as the last answer is
  applied; the 50 ms floor only stops a spin while no call is possible
  (airborne).
- `maxResultAgeMs: 1000`. At run speed an answer older than a second is
  about 7 yd stale.
- No injected `wait` option. Every decision names its input, and holding a
  key means Jev keeps choosing it.

### Act and the dead-man stop

Applying an option sets the facing (`face`, `MSG_MOVE_SET_FACING`) and drives
the keys with `drive(input, DEADMAN_MS)`, where `DEADMAN_MS` is 1500.

- A decision for the same keys renews the lease. A different decision
  replaces it. `stop` halts.
- If Jev stops answering, because of a timeout, a transport failure or a slow
  tail, the lease lapses and the mover sends `MSG_MOVE_STOP` within 1.5 s.
  That's the dead-man stop. While answers keep coming it never fires.
- The combat loop's 2.5 s lease (`MOVE_LEASE_MS`) is left alone in this slice.

### Perceive: the frame

Code computes all geometry. The frame sends named values with units and
holds no coordinate arrays.

- **Objective:**
  - To reach a point: distance and bearing relative to the facing, for
    example `"23 yd, 40° to your left"`.
  - To run a circle: how far the character is off the circle (inside or
    outside), the direction the circle continues relative to the facing, and
    the share of the lap done.
- **Self:** the keys held, whether airborne, speed, and the last 3 decisions
  with how far each moved the character.
- **Surroundings:** for 8 headings relative to the facing, the free distance
  before something blocks (capped at 10 yd) and what blocks it:
  - a wall (the low and high rays are both blocked),
  - a low obstacle with its top height (only the low ray is blocked),
  - a drop or slope too steep to walk.

  Free distance comes from the same step-and-collision checks the mover uses
  (`groundStep`, `collisionFree` in `packages/core/src/wow/ground-step.ts`),
  marched in 0.5 yd steps along each heading.

### Decide: the options

There is one Choice per tick, and each option's description carries the
facts for that option. Code rebuilds the options every tick:

| Option | Input |
|---|---|
| `run_ahead` | keep the facing, forward |
| `veer_left`, `veer_right` | turn 30°, forward |
| `turn_left`, `turn_right` | turn 90°, forward |
| `turn_around` | turn 180°, forward |
| `strafe_left`, `strafe_right` | keep the facing, strafe |
| `back_up` | keep the facing, backward |
| `jump_ahead` | keep the facing, forward and jump |
| `stop` | halt |

Each description gives the free distance along that heading and where the
objective would sit after the turn, for example `"Veer 30° left and run:
clear for 9 yd; the goal would be 10° to your right"`.

- **Masking (danger in code).** An option whose heading is clear for less than
  2 yd, which is about one decision of travel, is not offered. `stop` is
  always offered. Re-observing at commit already discards an answer that is
  no longer available.
- **Jump gate.** `jump_ahead` is offered only when code finds a low obstacle
  ahead (top 0.3–1.4 yd) within the next 1–3 yd, and the jump arc from the
  current pose clears it and lands on walkable ground. The arc uses
  `JUMP_VELOCITY` 7.955547 and `GRAVITY` 19.291105, which give an apex of
  1.64 yd and about 5.8 yd of travel at run speed.

  Whether and when to jump is Jev's choice. No code path jumps except an
  applied `jump_ahead`.
- **Airborne.** While airborne there are no options and no call is made,
  because momentum is fixed until landing.

### Outcomes

The pilot run ends when one of these happens:

- **Completed:**
  - to reach a point: the character is within 1.5 yd of it;
  - to run a circle: the lap has swept 360° and the character is within 3 yd
    of the start.
- **Stopped:** a human takes over, the run is aborted, Jev is unavailable,
  or the time budget runs out.
- **Failed:** the character dies.

In every case the character halts, and the run report gives the decisions
made, the jumps, the distance walked and the calls.

## Control

`pilot` is an agent tool that starts a harness run, as `engage` and `travel`
do:

- It claims `agent` control and moves to `loop` when the run outlives the
  turn.
- A human takeover (PLAY F1, `/stop`, the stop reflex) claims `human`. That
  stops all runs, so the pilot's loop stops and halts the character.
- `travel` (namigator routes) stays as the planner-driven way to move. The
  pilot is a second way, chosen by the agent.

## Logging

- Pilot events go to `jev.jsonl` like the combat loop's, tagged
  `loop: "pilot"`. Every call can still be replayed byte for byte.
- The game log gains a `pilot/decision` row for each applied decision (the
  call, the option, the pose, airborne or not) and a `pilot/ended` row with
  the outcome. The grader measures from these rows.

## Proof

There are three tasks, each with a training scenario and a held-out
scenario at a different place. Each one starts on a throwaway character
placed by the scenario's setup. The agent's task names the `pilot` objective.

| Task | Pass |
|---|---|
| Circle (r ≈ 10 yd) | The run completes. The final truth position is within 3 yd of the start. Every `pilot/decision` pose is 5–15 yd from the centre. |
| Detour around a tree or rock (goal ≥ 20 yd away, straight line blocked) | The final truth position is within 3 yd of the goal. There are no `control/server_correction` rows. |
| Fence (goal across a low fence, detour long) | The final truth position is past the fence, within 3 yd of the goal. Every `MSG_MOVE_JUMP` follows an applied `jump_ahead`. Each jump lands (`MSG_MOVE_FALL_LAND`). There are no corrections. |

Every scenario also requires that the agent called no movement tool other
than `pilot`.

- **Bar:** 3/3 replicas pass on each training scenario, and at least 2/3 on
  each held-out scenario.
- **Grading:** programmatic measures in `draft-measure.ts`, with server truth
  for the final position.

## Hill-climbing

The method follows
<https://claude.dev/blog/automating-eval-design-and-hillclimbing/>:

- **What changes:** only text. That means the option descriptions, the
  standing instruction and the frame's field names and buckets. Controller
  code is frozen during a climb, because the post warns that harness edits
  overfit.
- **Split:** fixed by place before round 1. The climber reads training runs
  only and never puts a training coordinate or a failed run into the prompt.
- **Round 0:** the unmodified baseline gives the noise estimate.
- **Each round:** one change aimed at one root cause. Keep it when training
  rises and held-out does not fall. Revert otherwise.
- **Stalls:** after 2–3 flat rounds, one pass with no edit sorts the remaining
  failures into frame, option, grader, task or infrastructure causes.
- **Cap:** 8 rounds, or 3 rounds in a row without a training gain.
- **Pinning:** the Jev model is pinned per round from `jev.jsonl`, and the
  baseline is rerun when `jev-latest` moves.

## Out of scope

- Kiting and other layering of movement with combat.
- Aggro envelopes, and Jev seeing other units.
- Changing the combat loop's lease.
- Predicting the pose ahead of latency. It's a candidate if the evals show
  overshoot, but it is code, not a hill-climb surface.

## Sources

- SIMA 2: <https://arxiv.org/html/2512.04797v1>
- Cradle: <https://arxiv.org/html/2403.03186v2>
- VPT: <https://arxiv.org/pdf/2206.11795>
- Diffusion Policy: <https://arxiv.org/pdf/2303.04137>
- ACT: <https://arxiv.org/pdf/2304.13705>
- Nav2 velocity smoother: <https://index.ros.org/p/nav2_velocity_smoother>
- VFH: <https://www.mathworks.com/help/nav/ug/vector-field-histograms.html>
- Context steering: <http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter18_Context_Steering_Behavior-Driven_Steering_at_the_Macro_Scale.pdf>
- Unity off-mesh links: <https://docs.unity3d.com/560/Documentation/Manual/nav-BuildingOffMeshLinksAutomatically.html>
- TypeSafe jev-1.13 jaggedness: <https://docs.typesafe.ai/model-jaggedness/jev-1.13.md>
- Kotoko bounded autonomy: <https://arxiv.org/html/2604.04703v2>
- MKOAgent: <https://github.com/MatthewOglesby/MKOAgent>
