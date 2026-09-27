# Roadmap

Peon is being rewritten around the Pi harness. This is the sole
current roadmap.

## Where things stand

- **Core** (`packages/core`) implements the World of Warcraft 3.3.5a
  protocol primitives: authentication, the world session, movement and
  navigation, combat with Jev, quests, vendors, chat, groups and the world
  state the rest is built on.
- **The Pi harness** (`packages/harness`) is the only way to play. A model
  plays one character through ten game tools while a human watches and can
  type to it. See [harness.md](harness.md).
- **The evals** grade the harness on scripted scenarios against the live
  server, with throwaway characters and server-confirmed checks. See
  [evals.md](evals.md). The last round passed all 13 scenarios of round 1.

## What is next

- **The round-7 briefs**, written and not run:
  - quiet wakes: keep `not_implemented` in the game log only, and drop
    queued wakes whose condition no longer holds;
  - engage reports: enemy HP and level on death, XP on every summary,
    attacker-aware danger, and which reward to take;
  - healer guard and damage log: cast a castable self-heal below 35 % HP
    before asking Jev, and parse the damage and power packets;
  - halt windows and preset: grade `t7-halt-resume` by its steer windows,
    give `t2-whisper-reply` an end rule, and drop conjured items from
    `eversong10`.
- **The unrun scenarios.** 24 of the 37 catalogue scenarios have not run,
  including the tier-8 long-horizon runs `t8-grind-30` and
  `t8-quest-to-level-3`, which need a long lane. The catalogue is in
  [the eval suite design](plans/2026-09-26-pi-harness-epic/eval-suite.md).
- **Autonomous levelling from 1 to 80**, the long-term goal.

The full list of open work, with the items deferred from the last round,
is section 12 of
[the harness epic design](plans/2026-09-26-pi-harness-epic-design.md).

## Finished milestones

These milestones built the capabilities core has now. They are closed;
their designs are in [plans/](plans/).

- **M1. Evidence baseline and direct control:** observations, movement,
  facing, targeting and cancellation through a programmatic interface.
- **M2. A constrained Jev-controlled encounter:** Jev chooses tactical
  actions in a live fight.
- **M3. Movement as a tactical action:** Jev moves the character during a
  fight under a renewable movement lease.
- **M3a. Reliable local navigation:** route planning with namigator,
  arrival and refusal reporting, and clean halts.
- **M3b. Remote movement and character following:** remote player
  movement reception; character following was not built.
- **M4. Repeatable encounter cycles:** fight, loot, death and recovery in
  a bounded cycle.
- **M5. A selected questing loop:** quest accept, objectives and turn-in
  in core; the harness completes a first quest in `t4-quest-first`.
- **M6. Sustained supervised play:** superseded by the harness, where a
  human watches, steers and stops the agent; long sessions are the tier-8
  scenarios above.

## High-level goals

The maintainer sets the next high-level goals.
