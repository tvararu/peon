# UI gallery: seven Pi harness UI concepts (key: ui-gallery)

> Record copy for the [Pi harness epic spec](../2026-09-26-pi-harness-epic-design.md),
> taken 2026-09-26 from the epic's scratch notes. `HANDOVER.md` (the
> coordinator's working notes) was not kept: its rulings R1-R38 are the
> spec's Decisions section. Paths under `~/.cache/pi-epic-scratch/`, and
> scratch files in the checkout's `tmp` directory other than the copies in
> this directory, were not kept. Wrapper, account and eval paths in that
> directory name outputs that the described tools write at run time.
> `src/...` paths before the workspace split now live under
> `packages/<pkg>/src/`.


Date 2026-09-26. Source concepts: `design/ui/<key>/README.md` (not kept)
and their frames. The HTML version with colour is
`design/ui-gallery.html` (not kept).

Marks: **measured** = I ran it; **read** = I read the source; **inferred** =
my conclusion. "Concept says" = a claim from a concept README that I did not
check again. Pi paths are in the scratch installs of 0.87.1
(`~/.cache/pi-epic-scratch/ui-layout/node_modules/@earendil-works/`,
`package.json` `"version": "0.87.1"` for `pi-coding-agent` and `pi-tui`,
read). Abbreviations: `TYPES` = `pi-coding-agent/dist/core/extensions/types.d.ts`,
`IM` = `pi-coding-agent/dist/modes/interactive/interactive-mode.js`,
`TUI` = `pi-tui/dist`.

## Verdicts

The deciding constraint is R22, not feasibility. By 2026-09-27 00:00 UTC the
target is a harness skeleton that plays on Luna in an Orca pane, with the
core tools, **a first panel**, and eval round 1 done (HANDOVER.md R22). All
seven concepts are feasible or feasible-with-work. Five of them need core
data that does not exist tonight (relation, zone name, route points,
lootable, classification). So a round-1 concept must (a) ride a surface that
round 1 needs anyway, (b) degrade cleanly when a core field is missing, and
(c) not need a Pi mode that nobody has run in an Orca pane.

| Concept | Surface | Feasibility | Verdict | One-line reason |
|---|---|---|---|---|
| ui-tool-renderers | `renderCall`/`renderResult` on each `wow_*` tool | feasible | **build in round 1** | Rides the tools themselves; splits model text from human view; answers R10 directly |
| ui-unit-frames | `setFooter`, fixed 4 rows | feasible-with-work | **build in round 1** | The "first panel": zero transcript cost; most fields exist in core today |
| ui-event-ticker | `registerMessageRenderer` cards + 6-row widget | feasible-with-work | **build in round 1** (cards and a trimmed widget) | Pushed events need a renderer anyway, or they fall back to Pi's purple default box |
| ui-layout | fullscreen `setLayoutRoot` split with a side panel | feasible-with-work | **later** (round 2, behind a flag) | The only true side panel, but it needs `tuiMode: "fullscreen"` (Pi calls it experimental), not yet run in an Orca pane |
| ui-tactical-map | 12-row widget + `/map` overlay | feasible-with-work | **later** (as `/map` overlay, then a panel section) | Three core gaps (relation, route points, lootable); 12 rows of transcript |
| ui-quest-tracker | 6-8-row widget + side overlay | feasible-with-work | **later** | `wow_quests` renderer already gives the joined view in round 1; turn-in NPC needs protocol work |
| ui-terrain-minimap | 20-row widget from namigator | feasible-with-work | **later** (as a layer under the tactical map; drop the standalone widget) | Map 530 only; synchronous `bun:ffi` tile loads stall 130-200 ms; 20 rows |

No concept is dropped. The standalone 20-row terrain widget form is dropped;
its terrain layer stays.

Scope flag (not resolved here): HANDOVER.md:221 says "R5 superseded: the Jev
tactical loop is out", HANDOVER.md:328 says "R5 refined (coordinator's
reading, not yet confirmed)" that fight and cycle are exposed as tools, and
this task's brief says they are exposed. The `wow_fight` renderer and the
JEV section of ui-layout depend on the R5-refined reading. Both renderers
only need a run with a status, decisions and an outcome, so they fit a later
replacement loop too (concept says; inferred).

## Proposed screen at 160 columns (round 1)

Stitched from the measured frames of three round-1 concepts (measured:
`~/.cache/pi-epic-scratch/ui-gallery/compose.ts` checks with pi-tui
`visibleWidth` that every line is at most 160 columns and that there are 48
rows; output `rows 48 transcript 35 maxw 160 over []`). It is a composite,
not one render from a live `InteractiveMode`.

```text


 Clear the wyrms near Erona, then turn in 8325.



 wow_nearby ≤60y
  1 ● Mana Wyrm                   L3 █████▋····  56%  8.9y ↑  ◎ on you #081d52                                                    ┌─────────────────────────┐
  2 P Thalorien                   L4 ███████▍··  74%   12y ↓  #000ad7                                                             │    ····         ····    │
  3 x Mana Wyrm                   L3 ··········   0%   13y →  dead #081d4e                                                        │  ··                 ··  │
  4 ● Mana Wyrm                   L2 ██████████ 100%   29y ←  #081d61                                                             │··   9                !··│
  5 ● Springpaw Cub               L2 ██████████ 100%   33y →  #0827a0                                                             │·       4         6     ·│
  6 ! Magistrix Erona             L6 ██████████ 100%   37y ↑  quest #004980                                                       │             1           │
  7 ◆ Scroll of Scourge Magic                          38y ↓  #0001c2                                                             │            ↗ 3          │
  8 ● Springpaw Cub               L1 ██████████ 100%   41y ↓  #0827b3                                                             │          2              │
  9 ● Springpaw Lynx              L3 ██████████ 100%   46y ←  #0827c9                                                             │·    7           5      ·│
    ● Mana Wyrm                   L2 ██████████ 100%   47y →  #081d77                                                             │··     8           ●   ··│
    ! Julia Sunstriker            L5 ██████████ 100%   59y ↑  vendor repair #004985                                               │  ··                 ··  │
                                                                                                                                  │    ····         ····    │
                                                                                                                                  └─────────────── 60y  N↑ ─┘
 11 of 23 in range · origin predicted (10331, -6341) facing NE · nearest first

 ✉ 08:38:31 Perlerun whispers › need a hand with the dragonhawks? (ctrl+o)


 wow_fight ⚔ Mana Wyrm #081d52  “kill it, keep mana above 30%”
 ◉ active  10.8s · 31 Jev calls · timeouts 0/3
   ⚔ Mana Wyrm L3           ██████████▍···················     19/55  26.4y facing
   ◈ Aelwyn L5              ██████████████████████▋·······   164/217  hp
                            █████████████▏················   131/300  mana
   casting Smite          ███████▊······ 1.1/2.0s
   actions  ⟲···→→→⟲✦····✦····⚔··✦·····✦···▌

 The nearest wyrm is on me and Jev has it. I will answer Perlerun after this pull, then turn in 8325.

▌⚔ Springpaw Stalker L7 ██░░░░ 11s │ 1 kill +84 xp │ world units +3−3
 11s ✝ Crazed Dragonhawk killed in 6s · dealt 103 · took 74 · +84 xp                                            │ ▼ in  ···········█·▂·▅·▄·▃·▇▂···········  123
 11s ◈ looted item #2966                                                                                        │ ▲ out ·············▂█··█·▂······█·▄·▃·▄·  193
  7s ✉ Perlerun: need a hand with the dragonhawks?                                                              │
  2s ◆ Kaelyn: omw, 2 min                                                                                       │
  1s ⚔ Springpaw Stalker L7 47/137 · dealt 90 · took 7                                                          │       -30s                           now
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
>
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Xiara 11 Priest  HP▕████████████████████▌ ▏188/202  MP▕█████████████████▌    ▏438/550  XP▕████▌       ▏38%  ⚔ COMBAT                  Eversong Woods  2g 03s 18c
▶ Springpaw Stalker 7 hostile  ▕████▋                 ▏29/137  ⇠ on you  SW: Pain 14s                                                ✦ Smite▕█████▋        ▏1.2s
Party  ★Kaelthas 10▕██████▏100%                                                              Power Word: Shield 21s · Power Word: Forti… 29m  CD Mind Blast 1.6s
openai-codex/gpt-6-luna · high · ctx 14% of 400k · ↑38k ↓4.1k · wake:on · log 1.2 MB
```

Regions, top to bottom:

| Rows | Region | Source | Pi primitive |
|---|---|---|---|
| 1-35 | Transcript: user turn, `wow_nearby` expanded with its mini-map, a whisper card, a running `wow_fight`, the assistant reply | `ui-tool-renderers/frame-160.txt:60-76`, `:122-130`; `ui-event-ticker/frame-160.txt:3` | `ToolExecutionComponent` + `renderCall`/`renderResult`; `registerMessageRenderer` |
| 36-41 | EventTicker widget, fixed 6 rows | `ui-event-ticker/frame-160.txt:19-24`, edited (below) | `setWidget(key, factory, { placement: "aboveEditor" })` |
| 42-44 | Pi editor (rules and prompt drawn as placeholders) | none | Pi's own editor |
| 45-48 | Unit-frames HUD + Pi trailer line | `ui-unit-frames/frame-160.txt:3-6` (`combat-solo`) | `setFooter` |

Edits I made to measured lines (stated so no one mistakes them for render
output): the digest segment `│ you 79/202 (39%) 219/550 ` is removed, and the
ticker's `hp` and `mp` rows in the right panel are blanked to `│`. The user
line (row 2) and the assistant line (row 34) are my text. The three concepts
use different fixtures (Aelwyn and a Mana Wyrm in the tools, "Xiara" and a
Springpaw Stalker in the HUD), so the values do not agree across regions.

Reasons:

1. **Every region rides a surface that round 1 builds anyway.** The tools
   exist for the agent; their renderers are an addition to
   `defineTool` (TYPES:387, read). Pushed events need a message renderer, or
   `CustomMessageComponent` draws the purple default box
   (`custom-message.js:49-52`, read; the concept measured at least 5 rows).
   The footer is one `setFooter` call (IM:1881-1900, read).
2. **No persistent map widget in round 1.** The expanded `wow_nearby` result
   draws a mini-map at 112 inner columns or more (ui-tool-renderers README,
   measured there), so the human gets a map on each nearby call without 12
   rows of fixed widget. The tactical map arrives later as `/map`.
3. **Why 160 without a side panel works:** at 160 the nearby mini-map
   appears, the ticker moves its sparklines to a right panel (at 110 or
   more, concept says), and the HUD bars widen to 22 cells (concept says,
   measured there). Below 110 all three degrade to their narrow forms, which
   the concepts rendered at 80 (measured there).
4. **No duplicated facts.** The HUD owns self HP, power, target and cast. So
   the ticker drops its `you …` digest segment and its HP/MP bars when the
   footer is on. The ticker keeps what the HUD lacks: the live fight row,
   kills, loot, chat and the damage sparklines.
5. **Ticker above the editor, not below.** pi-ui.md #13 put a combat strip
   `belowEditor`; the ticker concept chose `aboveEditor` with a fixed 6 rows
   so the editor never jumps. I keep `aboveEditor`: below the editor it would
   sit between the prompt and the HUD and split the two status bands.
6. **Row budget at 48 rows:** 4 HUD + 3 editor + 6 ticker = 13 fixed rows,
   which leaves 35 rows of transcript (measured, compose script). At 40 rows
   that leaves 27.
7. **Regular mode, not fullscreen.** Nothing here needs `tuiMode:
   "fullscreen"`. That keeps the eval pane in the mode the spike already
   ran. Round 2 can switch to the ui-layout split behind a flag and move the
   tactical map and quest tracker into its panel.

Eval note (R18): in fullscreen mode, `orca-ide terminal read --screen` would
read the alt-screen viewport only, not scrollback (inferred). Graders have
the Pi session JSONL and the typed game log (R20) for the rest.

## Pi primitive check

I checked the load-bearing Pi claims of each concept against pi-ui.md and the
0.87.1 package code. Result: every checked claim holds, with two corrections
to pi-ui.md and one open question downgraded.

**Corrections to pi-ui.md:**

- pi-ui.md §8 #19 says a persistent side pane that reflows the transcript is
  "not-feasible (without forking or private-field access)", and §4 says "A
  reserved side column … is not in the extension API". ui-layout measured it
  working through public API only: `ViewportTUI.setLayoutRoot` is public
  (`TUI/tui.d.ts:248`, read), `isViewportTUI` is exported
  (`TUI/index.d.ts:29`, read), `children: Component[]` is public
  (`TUI/tui.d.ts:215`, read), and InteractiveMode mounts its seven
  containers in a fixed order (IM:661-668, read). The route is public but
  depends on that child order, which is an implementation detail. pi-ui.md
  was too pessimistic here.
- ui-unit-frames leaves open whether `setFooter` from `session_start` takes
  effect, by analogy to the header ordering trap. The code has no such
  guard: `footerContainer` is built in the constructor (IM:383),
  `setExtensionFooter` only clears it and adds the child (IM:1881-1900), and
  `init()` calls `this.ui.start()` (IM:676, with the comment "Start the UI
  before initializing extensions so session_start handlers can use
  interactive dialogs", IM:675) before `rebindCurrentSession()` (IM:739),
  which calls `bindCurrentSessionExtensions()` (IM:1546). So: read, likely
  fine; not run live.

**Checked and confirmed (read):**

| Claim | Where | Used by |
|---|---|---|
| `setWidget` factory form; placements only `aboveEditor`/`belowEditor` | TYPES:44-49, :98-101 | map, ticker, quests, terrain, layout |
| String-array widgets capped at `MAX_WIDGET_LINES = 10`; component widgets uncapped | IM:1790-1799, :1852 | map, quests |
| `setFooter(factory(tui, theme, footerData))`; `getExtensionStatuses()` | TYPES:108-110; `core/footer-data-provider.d.ts:38` | unit-frames |
| `ExtensionMode = "tui" \| "rpc" \| "json" \| "print"` for the TUI guard | TYPES:209-214 | unit-frames, map |
| `ctx.ui.custom(factory, { overlay, overlayOptions, onHandle })` | TYPES:118-128 | map, quests, terrain |
| `hideOverlay()` pops the topmost entry, not a given one | `TUI/tui.js:450-465` | map, quests, layout |
| `nonCapturing` overlays do not take focus | `TUI/tui.js:357`, `:395`, `:523` | quests, layout |
| `MIN_RENDER_INTERVAL_MS = 16` | `TUI/tui.js:169` | all |
| `compositeOverlays(lines, termWidth, termHeight)` exists (offline frames only) | `TUI/tui.js:904` | map |
| `registerMessageRenderer`, `registerEntryRenderer`, `sendMessage({…}, {triggerTurn, deliverAs})`, `appendEntry` | TYPES:1040-1049, :1060 | ticker |
| `CustomMessageComponent` adds `Spacer(1)` before every message; exported | `components/custom-message.js:21`; `pi-coding-agent/dist/index.d.ts:29` | ticker |
| A custom message renderer runs first; the default box is the fallback | `custom-message.js:49-52` | ticker |
| `ctrl+o` is `app.tools.expand`; `setToolsExpanded` expands every child | `core/keybindings.js:52`; IM:3609-3622 | ticker, tool renderers |
| `ToolExecutionComponent` adds `Spacer(1)`; calls `renderCall` before `renderResult`; renderer exceptions are caught | `components/tool-execution.js:43`, `:245`, `:267`, catch blocks at `:249-250`, `:271-272` | tool renderers |
| `renderCall`, `renderResult`, `renderShell`, `defineTool` | TYPES:361, :375, :377, :387 | tool renderers |
| `tool_execution_update` → `updateResult(partial, true)` + `requestRender` | IM:2828-2831 | tool renderers |
| `ToolRenderContext` and `getThemeByName` are not exported from the package root; `Theme`, `initTheme`, `ThemeColor` are | `pi-coding-agent/dist/index.d.ts:30` (rg found no `ToolRenderContext`) | tool renderers, map, terrain |
| `Theme.bold` is `chalk.bold` (offline frames need `FORCE_COLOR=3`) | `modes/interactive/theme/theme.js:212-213` | ticker, tool renderers |
| Extension shortcuts are checked first in the editor | `components/custom-editor.js:62-66`; wired at IM:1678 | layout |
| `HStack`, `VStack`, `ScrollView` (`follow`, `primary`), `StackEntryOptions.visible` exported | `TUI/index.d.ts`; `TUI/components/stack.d.ts:3-10`; `scroll-view.d.ts:6-7` | quests, layout |
| An `HStack` measures each child's height by rendering it | `TUI/layout.js:118-120` | layout (why `MeasurelessColumn` exists) |
| `setLayoutRoot` is a no-op for the same root; without a root the alt screen uses an implicit scroll view | `TUI/tui-alt-screen.js:129-131`, `:1436` | layout |
| "Close active overlays before changing TUI mode" | IM:4116 | layout |
| The `tui` handed to factories is a stable proxy | `modes/interactive/tui-renderer.js:35-36` | layout |

**Not confirmed here** (concept says; I did not re-check): all render-cost
numbers, all width sweeps, the F2/F3 keybinding run and the TUI-mode round
trip in ui-layout, the `hideOverlay` pop-order experiment in pi-ui.md §4, and
every core `src/wow/*` file:line that the concepts cite for data gaps.

## Concepts

Each section gives the 120-column frame as the concept rendered it (not
edited), what it answers, feasibility, cost and the verdict.

### 1. ui-tool-renderers: build in round 1

`frame-120.txt`, all 167 lines (the concept stacks five tools; each block
shows the human view and then the exact model text):

```text
tuicraft harness · tool renderers · 120 cols
Each block: what the human sees in Pi's transcript (ToolExecutionComponent + renderCall/renderResult), then the exact
text the model receives.

── HUMAN · wow_look ────────────────────────────────────────────────────────────────────────────────────────────────────


 wow_look self · target · surroundings
 ┌───────────────────────────────┐  Aelwyn L5 Priest
 │      ····           ····      │  Sunstrider Isle (10331, -6341) facing NE
 │   ···                   ···   │  HP ██████████████████▏·····  164/217
 │ ···                      !··· │  MP ██████████▌·············  131/300
 │··     2                     ··│
 │·                             ·│  Target Mana Wyrm L3 ████▌··· 56% 9y ↑
 │                 1             │
 │               ↗               │  3 hostile within 40y · ◎ someone is on you
 │            P       x          │   1 Mana Wyrm          L3   9y ↑ ◎
 │·                             ·│   2 Mana Wyrm          L2  29y ←
 │··◆                          ··│   3 Springpaw Cub      L2  33y →
 │ ···                     3 ··· │
 │   ···                   ···   │
 │      ····           ····      │
 └───────────────────── 40y  N↑ ─┘
 ↗you ●mob !npc ◆obj

── MODEL · content[0].text (345 B; details 2441 B never sent) ──────────────────────────────────────────────────────────
│ Aelwyn L5 Priest, HP 164/217, mana 131/300, Sunstrider Isle (10331, -6341).
│ Target: Mana Wyrm L3 56% 9y ahead (hostile, targeting you) #081d52.
│ 3 hostile within 40y, nearest is your target.
│ - Thalorien L4 74% 12y behind (friendly) #000ad7
│ - Magistrix Erona L6 100% 37y ahead (friendly, quest) #004980
│ - Scroll of Scourge Magic 38y behind #0001c2

── HUMAN · wow_nearby (collapsed: top 5) ───────────────────────────────────────────────────────────────────────────────


 wow_nearby hostile · ≤60y
  1 ● Mana Wyrm                   L3 █████▋····  56%  8.9y ↑  ◎ on you #081d52
  2 x Mana Wyrm                   L3 ··········   0%   13y →  dead #081d4e
  3 ● Mana Wyrm                   L2 ██████████ 100%   29y ←  #081d61
  4 ● Springpaw Cub               L2 ██████████ 100%   33y →  #0827a0
  5 ● Springpaw Cub               L1 ██████████ 100%   41y ↓  #0827b3
    … 2 more  (ctrl+o expands)
 7 of 23 in range · origin predicted (10331, -6341) facing NE · nearest first

── MODEL · content[0].text (407 B; details 2049 B never sent) ──────────────────────────────────────────────────────────
│ 7 matches of 23 within 60y, nearest first:
│ - Mana Wyrm L3 56% 9y ahead (hostile, targeting you) #081d52
│ - Mana Wyrm L3 0% 13y right (hostile, dead) #081d4e
│ - Mana Wyrm L2 100% 29y left (hostile) #081d61
│ - Springpaw Cub L2 100% 33y right (hostile) #0827a0
│ - Springpaw Cub L1 100% 41y behind (hostile) #0827b3
│ - Springpaw Lynx L3 100% 46y left (hostile) #0827c9
│ - Mana Wyrm L2 100% 47y right (hostile) #081d77

── HUMAN · wow_nearby (expanded with ctrl+o; mini-map joins at >=112 cols) ─────────────────────────────────────────────


 wow_nearby ≤60y
  1 ● Mana Wyrm                   L3 █████▋····  56%  8.9y ↑  ◎ on you #081d52            ┌─────────────────────────┐
  2 P Thalorien                   L4 ███████▍··  74%   12y ↓  #000ad7                     │    ····         ····    │
  3 x Mana Wyrm                   L3 ··········   0%   13y →  dead #081d4e                │  ··                 ··  │
  4 ● Mana Wyrm                   L2 ██████████ 100%   29y ←  #081d61                     │··   9                !··│
  5 ● Springpaw Cub               L2 ██████████ 100%   33y →  #0827a0                     │·       4         6     ·│
  6 ! Magistrix Erona             L6 ██████████ 100%   37y ↑  quest #004980               │             1           │
  7 ◆ Scroll of Scourge Magic                          38y ↓  #0001c2                     │            ↗ 3          │
  8 ● Springpaw Cub               L1 ██████████ 100%   41y ↓  #0827b3                     │          2              │
  9 ● Springpaw Lynx              L3 ██████████ 100%   46y ←  #0827c9                     │·    7           5      ·│
    ● Mana Wyrm                   L2 ██████████ 100%   47y →  #081d77                     │··     8           ●   ··│
    ! Julia Sunstriker            L5 ██████████ 100%   59y ↑  vendor repair #004985       │  ··                 ··  │
                                                                                          │    ····         ····    │
                                                                                          └─────────────── 60y  N↑ ─┘
 11 of 23 in range · origin predicted (10331, -6341) facing NE · nearest first

── MODEL · content[0].text (504 B; details 3114 B never sent) ──────────────────────────────────────────────────────────
│ 11 matches of 23 within 60y, nearest first:
│ - Mana Wyrm L3 56% 9y ahead (hostile, targeting you) #081d52
│ - Thalorien L4 74% 12y behind (friendly) #000ad7
│ - Mana Wyrm L3 0% 13y right (hostile, dead) #081d4e
│ - Mana Wyrm L2 100% 29y left (hostile) #081d61
│ - Springpaw Cub L2 100% 33y right (hostile) #0827a0
│ - Magistrix Erona L6 100% 37y ahead (friendly, quest) #004980
│ - Scroll of Scourge Magic 38y behind #0001c2
│ - Springpaw Cub L1 100% 41y behind (hostile) #0827b3
│ (+3 more; narrow with kind/within/name)

── HUMAN · wow_goto (streaming: isPartial) ─────────────────────────────────────────────────────────────────────────────


 wow_goto → Magistrix Erona #004980
 ▶ walking  ███████████████████████████████▏·····································  16.6 / 36.8y · 7.0 y/s · ETA 2.9s
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━@───────────────────○──────────────────────○──⚑  wp 2/4 · pose predicted

── MODEL · content[0].text (44 B; details 585 B never sent) ────────────────────────────────────────────────────────────
│ Walking to Magistrix Erona: 20y left of 37y.

── HUMAN · wow_goto (final: arrived) ───────────────────────────────────────────────────────────────────────────────────


 wow_goto → Magistrix Erona #004980
 ✓ arrived  Magistrix Erona 1.8y away · walked 35.0y in 5.3s
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━@○──⚑

── MODEL · content[0].text (49 B; details 586 B never sent) ────────────────────────────────────────────────────────────
│ Arrived at Magistrix Erona: 1.8y away after 5.3s.

── HUMAN · wow_goto (final: stopped) ───────────────────────────────────────────────────────────────────────────────────


 wow_goto → Magistrix Erona #004980
 ✗ stopped  obstructed 17y short of Magistrix Erona after 3.9s
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━@───────────○──────────────────────○──⚑
   next: wow_goto again: the path replans around the obstruction (1 of 3 replans left)

── MODEL · content[0].text (134 B; details 696 B never sent) ───────────────────────────────────────────────────────────
│ Stopped 17y short of Magistrix Erona: obstructed. Next: wow_goto again: the path replans around the obstruction (1 of
3 replans left).

── HUMAN · wow_fight (running tactics run: isPartial) ──────────────────────────────────────────────────────────────────


 wow_fight ⚔ Mana Wyrm #081d52  “kill it, keep mana above 30%”
 ◉ active  10.8s · 31 Jev calls · timeouts 0/3
   ⚔ Mana Wyrm L3           ██████████▍···················     19/55  26.4y facing
   ◈ Aelwyn L5              ██████████████████████▋·······   164/217  hp
                            █████████████▏················   131/300  mana
   casting Smite          ███████▊······ 1.1/2.0s
   actions  ⟲···→→→⟲✦····✦····⚔··✦·····✦···▌

── MODEL · content[0].text (76 B; details 3478 B never sent) ───────────────────────────────────────────────────────────
│ Fighting Mana Wyrm 35%, you 76% HP 44% mana, 11s, 31 actions, casting Smite.

── HUMAN · wow_fight (final) ───────────────────────────────────────────────────────────────────────────────────────────


 wow_fight ⚔ Mana Wyrm #081d52  “kill it, keep mana above 30%”
 ✓ completed server_kill_credit  +45 XP  17.1s · 49 Jev calls · timeouts 0/3
   ⚔ Mana Wyrm L3           ······························      0/55  24.9y facing
   ◈ Aelwyn L5              ████████████████████▉·········   151/217  hp
                            ███████▏······················    71/300  mana
   actions  ⟲···→→→⟲✦····✦····⚔··✦·····✦····→··✦·····✦····✦··
            wait 35 · Smite 7 · move 4 · face 2 · attack 1

── MODEL · content[0].text (89 B; details 5162 B never sent) ───────────────────────────────────────────────────────────
│ Fight completed: server_kill_credit after 17s, +45 XP. Mana Wyrm 0%, you 70% HP 24% mana.

── HUMAN · wow_quests ──────────────────────────────────────────────────────────────────────────────────────────────────


 wow_quests quest log
 ✓ Reclaiming Sunstrider Isle          [1]  ready → Magistrix Erona
 ▸ Unfortunate Measures                [2]  ██████████······   5/8 Lynx Collar
 ▸ Solanian's Belongings               [4]  ················   0/1 Scroll of Scourge Magic
                                            ████████████████   1/1 Solanian's Scrying Orb
                                            ················   0/1 Solanian's Journal
 ▸ A Fistful of Slivers                [4]  ████████········   3/6 Arcane Sliver
 ▸ quest 8345 (title pending)
 5/25 slots · 1 ready to turn in

── MODEL · content[0].text (388 B; details 1062 B never sent) ──────────────────────────────────────────────────────────
│ 5/25 quests:
│ - 8325 Reclaiming Sunstrider Isle: complete; Mana Wyrm slain 8/8; turn in to Magistrix Erona
│ - 8326 Unfortunate Measures: in progress; Lynx Collar 5/8
│ - 8330 Solanian's Belongings: in progress; Scroll of Scourge Magic 0/1, Solanian's Scrying Orb 1/1, Solanian's Journal
0/1
│ - 8336 A Fistful of Slivers: in progress; Arcane Sliver 3/6
│ - 8345 (title not known yet): in progress
```

- **Answers:** `nearby --json | jq` (248) and `| python3` (54), `tactics |
  jq` (45), `quests | jq` (42), and `sleep N; … | jq .data.lastOutcome`
  polling (walk-toward 60, goto 15) (pi-ui.md §0, measured there). Filters
  move into tool params. Each row carries relation, roles, `dead`,
  "targeting you" and a relative direction in words. `wow_goto` and
  `wow_fight` stream progress and end with one outcome sentence.
- **Feasibility:** feasible. Public 0.87.1 API only, Pi's own
  `ToolExecutionComponent`, no patches (concept says; primitives confirmed
  above). Data gaps: relation, npcFlags roles (quest-giver and flight-master
  bits are not defined in core), zone name (no source; show the map id).
- **Cost:** cold build 0.1-1.0 ms per tool row, cached 1.5-5 µs, partial
  update 0.1-1.0 ms (concept measured). Model text 44-504 B against
  `details` 0.6-5.2 KB; cap fight decisions in `details`.
- **Verdict: build in round 1.** It is the tools' own face, and it states
  the model/human split that R10 asks for. Degrade missing fields to the
  map id and "relation unknown".

### 2. ui-unit-frames: build in round 1

`frame-120.txt` (three scenarios stacked, each after a rule that stands in
for the editor border):

```text
# combat-solo @ 120 cols
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Xiara 11 Priest  HP▕██████████████▉ ▏188/202  MP▕████████████▊   ▏438/550  XP▕████▌       ▏38%  ⚔ COMBAT      2g 03s 18c
▶ Springpaw Stalker 7 hostile  ▕███▍            ▏29/137  ⇠ on you  SW: Pain 14s              ✦ Smite▕█████▋        ▏1.2s
Party  ★Kaelthas 10▕██████▏100%                      Power Word: Shield 21s · Power Word: Forti… 29m  CD Mind Blast 1.6s
openai-codex/gpt-6-luna · high · ctx 14% of 400k · ↑38k ↓4.1k · wake:on · log 1.2 MB
# party-elite @ 120 cols
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
★Thrag 16 Warrior  HP▕███████████▍    ▏511/720  RG▕███████▎        ▏450/1000  XP▕█████▊  ▏71%  ⚔ ATTACKING   14g 76s 05c
▶ Searing Blade Warlock 15 ◆Elite  ▕██████████▍     ▏1440/2210  ⚡ Shadow Bolt▕██████▏       ▏1.7s   ✦ Thunder Clap sent
Mirelle 16▕█████▎▏88%  Zul'jin 15▕█▌    ▏25%  Sarathiel 17▕██████▏100%?  Borgosh 16 offline              CD Revenge 1.8s
openai-codex/gpt-6-luna · high · ctx 14% of 400k · ↑38k ↓4.1k · wake:on · log 1.2 MB
# ghost-idle @ 120 cols
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Xiara 11 Priest  ☠ GHOST — run to corpse  XP▕████▌       ▏38%  ○ idle                         Eversong Woods  2g 02s 18c
✚ corpse 57.3 yd · too far from corpse  ▷ no target                                                                     
solo                                                                                                                    
openai-codex/gpt-6-luna · high · ctx 14% of 400k · ↑38k ↓4.1k · wake:on · log 1.2 MB
```

- **Answers:** `control + jq` (82) and `combat + jq` (64) polling for self
  HP, power, pose and target; auras and cooldowns as bare spell ids;
  `PARTY_MEMBER_STATS` only in JSON; corpse distance while dead (concept,
  citing pi-ui.md and taught-surface.md).
- **Feasibility:** feasible-with-work. The UI is done and typechecked
  (concept measured). `setFooter` timing is likely fine (read, see
  corrections). Available in core today: HP, power, level, own cast,
  buffs, debuffs, cooldowns, XP, money, party, class, death and corpse,
  combat flag, "target targets me", push hooks. Missing: target relation,
  classification (elite/rare), other units' casts, zone name, a sync spell
  name lookup (concept, read there).
- **Cost:** cached render about 0.006 µs; dirty rebuild 190-365 µs; a
  cast-bar tick wrote 523 bytes through pi-tui's differential render
  (concept measured). Fixed 4 rows at every width from 30 to 220 (concept
  measured, 0 failures).
- **Verdict: build in round 1.** This is the "first panel" of R22. Hide the
  relation word, badge, target cast bar and zone until core gives them.

### 3. ui-event-ticker: build in round 1 (cards and a trimmed widget)

`frame-120.txt` (pushed cards in the transcript, then the widget):

```text
── pushed game messages (registerMessageRenderer); 1 expanded, rest collapsed ──────────────────────────────────────────

 ✉ 08:38:31 Perlerun whispers › need a hand with the dragonhawks? (ctrl+o)

 ◈ 08:38:26 Loot › item #2966 x1 (no name in this log; handle labels it)
 ◆ 08:38:36 Party · Kaelyn › omw, 2 min (ctrl+o)

 ✝ 08:38:26 Kill › Crazed Dragonhawk killed in 6s · dealt 103 · took 74 · +84 xp
   │ target    Crazed Dragonhawk L7 (0xf130003d220380e3)
   │ window    6s, 1790325500290 → 1790325506701
   │ dealt     103 (sum of target health drops seen)
   │ taken     74 (sum of own health drops seen)
   │ xp        +84 (COMBAT xp, kind kill)

 ▲ 08:38:50 Level 12 › +19 max health, +16 mana
 ☠ 02:25:55 You died › health 1 → 0 · no killer known (no damage log parsed) (ctrl+o)

── widget: EventTicker (setWidget aboveEditor, 6 rows) ─────────────────────────────────────────────────────────────────
▌⚔ Springpaw Stalker L7 ██░░░░ 11s │ you 79/202 (39%) 219/550 │ 1 kill +84 xp │ world units +3−3                        
 11s ✝ Crazed Dragonhawk killed in 6s · dealt 103 · took 74 · +84 xp    │ ▼ in  ···········█·▂·▅·▄·▃·▇▂···········  123 
 11s ◈ looted item #2966                                                │ ▲ out ·············▂█··█·▂······█·▄·▃·▄·  193 
  7s ✉ Perlerun: need a hand with the dragonhawks?                      │ hp   █████████████▎░░░░░░░░░░░░░░░░░░░░  39%  
  2s ◆ Kaelyn: omw, 2 min                                               │ mp   █████████████▌░░░░░░░░░░░░░░░░░░░░  40%  
  1s ⚔ Springpaw Stalker L7 47/137 · dealt 90 · took 7                  │       -30s                           now      
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
> (Pi editor, not rendered in this frame)
```

- **Answers:** chat buried in entity churn (ENTITY_APPEAR/DISAPPEAR are
  51.3 % of logged lines), the wrong whisper filter the SKILL teaches,
  `read --json | jq` (54), "what is happening in this fight" needing a second
  process, and the spike pushing every chat line into context (concept,
  citing taught-surface.md and prior-ux.md). It also proposes which events
  reach the model and how (`triggerTurn`, `deliverAs`).
- **Feasibility:** feasible-with-work. Core has no per-hit damage: the four
  damage-log opcodes are stubs, so damage comes from health deltas between
  snapshots, which loses early hits and merges attackers (concept, read and
  measured there). Label the sparklines as estimates until those opcodes are
  parsed.
- **Cost:** widget cold render 0.14-0.47 ms, cached 0.01-0.03 µs, card
  40-63 µs, reducer 13.6 µs per event; a 1 Hz tick for ages (concept
  measured). Each card costs one extra `Spacer` row, so batch cards that
  arrive together (read, confirmed above).
- **Verdict: build in round 1.** The cards are mandatory for pushed events.
  The widget ships with the footer-duplicate segments removed. Glyph width
  of `◆ ◈ ⚔ ☠` in the Orca pane is not tested.

### 4. ui-layout: later (round 2, behind a flag)

`frame-120.txt` (a real `InteractiveMode` booted on a fake terminal; the
panel is 38 columns at this width):

```text
                                                                                  │ ● Fgklhjacpoo L2 Priest
 Finish Reclaiming Sunstrider Isle, then hand it in to Magistrix Erona.           │ Eversong Woods · Sunstrider Isle
                                                                                  │ 10260.8, -6341.8 → still ⚔ combat
                                                                                  │
 Checking where we are and what is left on the quest.                             │ HP ██████████████████████▉      85%
                                                                                  │ MP ███████████████▉             59%
                                                                                  │ XP █████▌               245/900
 wow_status                                                                       │
 Fgklhjacpoo L2 Priest, HP 61/72, MP 88/150, Sunstrider Isle (10260.8, -6341.8),  │ Mana Wyrm L2 · 11y
 facing E.                                                                        │ HP ███████████████████▏         71%
 Quest 8325 Reclaiming Sunstrider Isle: Mana Wyrm slain 5/8.                      │ MP ███████████████████████████ 100%
 3 hostile Mana Wyrms within 25y; nearest 11y NE, 71% HP, attacking you.          │ █████████▎            Smite 1.1/2.5s
                                                                                  │
                                                                                  │ JEV ────────────────────────────────
 Three kills left. The nearest wyrm is already on me, so I hand it to the fight   │ fight ▶  cycle ▶ fighting 5/16·2q
 loop.                                                                            │ ✓ spell:585:target in range, facing
                                                                                  │ last: completed · target_dead
                                                                                  │ MAP ────────────────────────────────
 wow_fight                                                                        │ ············∙∙∙·∙∙∙·∙∙∙············
 fight started: run r-5 on Mana Wyrm (L2, 11y NE). cycle 5/16 starts, 2 queued.   │ ·········∙∙·············*∙·········
                                                                                  │ ········∙···!·············∙········
                                                                                  │ ·······∙······x············∙·······
                                                                                  │ ······∙∙···········X·······∙∙······
 [wow-event]                                                                      │ ······∙··········→··········∙······
                                                                                  │ ······∙∙··p················∙∙······
 [WoW event] Mana Wyrm casts Faerie Fire on you. You take 7 damage (61/72).       │ ·······∙·············x·····∙·······
                                                                                  │ ········∙···o·············∙········
                                                                                  │ ·········∙∙·············∙∙·········
                                                                                  │ ············∙∙∙·∙∙∙·∙∙∙············
 [wow-event]                                                                      │ N↑ r=40y  x hostile ! quest * obj
                                                                                  │ NEARBY ─────────────────────────────
 [WoW] Kaelyss whispers: need a hand with the wyrms?                              │ x Mana Wyrm           2  71%  11y ↗!
                                                                                  │ x Mana Wyrm           1 100%  18y ↖
                                                                                  │ x Mana Wyrm           2 100%  24y ↘
 Jev is casting Smite on the wyrm (1.1 of 2.5 s). I will reply to Kaelyss once    │ p Kaelyss             3  88%  28y ←
 this pull is down, then take the last two wyrms to the north-west.               │ o Springpaw Cub       1 100%  30y ↙
                                                                                  │ ! Magistrix Erona     6 100%  31y ↖
                                                                                  │ QUESTS ─────────────────────────────
                                                                                  │ • Reclaiming Sunstrider Isle
                                                                                  │   ██████▎    5/8 Mana Wyrm slain
                                                                                  │ • Unfortunate Measures
                                                                                  │   ██▌        2/8 Lynx Collar

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
~/.cache/pi-epic-scratch/ui-layout/workspace
↑5.4k ↓180 0.7%/272k                                                                                   gpt-6-luna • high
```

- **Answers:** R9 (visual information tuicraft never built: the roadmap's
  player-centred grid), supervisor blindness to the Jev loop (M6: `wait` 1241
  of 1253 times, noticed only by polling), and, through the typed
  `PanelState`, the same R10 habits as the other concepts (concept).
- **Feasibility:** feasible-with-work. It is the only concept that reflows
  the transcript (measured there). Risks: it needs `tuiMode: "fullscreen"`,
  which Pi's settings call experimental (concept says); it depends on the
  seven-container child order (IM:661-668, read); `/reload` is not run; the
  panel height reserve is a constant; the F2 byte sequence through Orca and
  Blink could not be determined.
- **Cost:** 1.5-2.6 ms per frame with the panel shown, against 0.07-0.49 ms
  for stock Pi; the extra cost is pi-tui width arithmetic on non-ASCII
  glyphs (concept measured).
- **Verdict: later** (round 2, behind a flag, with the regular-mode layout
  above as the fallback). When it lands, its panel should host the tactical
  map and the quest tracker. It should not draw its own vitals and target:
  those duplicate the unit-frames footer.

### 5. ui-tactical-map: later

`frame-120.txt` (compact widget in a composed Pi screen; the 12 blank rows at
the top are the frame's own transcript area):

```text












 Two dragonhawks pulled while we walked to Degolien. Handle it.



 surroundings hostile, 40y
 2 hostiles on you: A Crazed Dragonhawk 25y W 62% (target), B Crazed Dragonhawk 27y W 100%. Loot: D Springpaw Stalker
 corpse 8y NE. Goto to Ranger Degolien paused, 47y left.


 Both dragonhawks target you and the goto is paused. I will finish A (62%), then B, loot D, and resume the route to
 Degolien.

─ Tactical Eversong Woods  2 hostile ≤40y 2 on you ─────────────────────────────────────── N↑ 4.0y/col · ctrl+m expand ─
·   ·   ·   ·   ·   ·   ·   ⡀⠄⠄⠠⠠ ⡀ ·   ·   ·   ·  *·   ·   ·│← You L10 ▰▰▰▰▱ 79% W 269° predicted · ◌ 71y SE, 707s old
                        ⠠⠐⠈        ⠁⠂⡀                       │A Crazed Dragonhawk                 7 ▰▰▰▱▱  62% 25y← !you
·   ·   ·   ·   ·   · ⡐⠈·   ·   ·   · ⠢ ·   ·   ·   ·   ·   ·│B Crazed Dragonhawk                 7 ▰▰▰▰▰ 100% 27y← !you
                     ⠠     ⡠⠐ ⠁⠁⠐⠠⡀    ⠐⡀                    │C Partymate                         9 ▰▰▰▰▱  81%  8y↙ pty
·   ·   ·   ·   ·   ⠠⠁  · ⠂ ·   $  ⠂·   ⠂   ·   ·   ·   ·   ·│D Springpaw Stalker                 7       loot  8y↗
                    ⢐  BA⠨ ⠠⠤⢼←⣙⠄  ⠨    ⠨          •         │E Springpaw Stalker                 7 ▰▰▰▰▰ 100% 53y←
·   ·   · • ·   ·E  ⠠   ·⠈⡀ ·⠈C⠉⠉⢢ ⡈·   ⡈   ·   ·   ·   ·   ·│F Ranger Degolien                  30 ▰▰▰▰▰ 100% 39y↓ ?
                     ⠡     ⠢x   ⢀⠨⢆    ⢀⠂                    │G Jilanne                           9 ▰▰▰▰▰ 100% 43y↘ ?
·   ·   ·*  ·   ·   · ⢂ ·   · ⠁⠁·⡠⠃ · ⡠ · • ·   ·   ·   ·   ·│
                       ⠈⠠⢀      ⠐⢅**⡀⠂      *                │◎ goto Ranger Degolien · 4 legs · 47y left
·   ·   ·   ·   ·   ·   · ⠈ ⠂⠄⠄⠠⠠*F⠁·  •· • ·◌  ·   ·   ·   ·│•foe •neu •ally •? @pty x $loot *obj ◎goto ◌srv A target
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
fight B next, then loot D
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
~/code/tuicraft · You L10 · openai-codex/gpt-6-luna · high
```

- **Answers:** `nearby + jq` (248), `control + jq` (82), `nearby + python3`
  (54); who is hostile and who is on me; lootable corpses; bearing and
  distance math by hand; three never-built ideas from prior-ux.md (route
  legs, server-pose ghost, aggro marks) (concept).
- **Feasibility:** feasible-with-work. Three handle gaps: relation (no
  getter; the logic is in `FactionTemplateCatalog`), the route polyline
  (held in a protected field), and the lootable bit (`UNIT_FIELDS` not on
  the barrel) (concept, read there). Also no zone name.
- **Cost:** rebuild 47-304 µs up to 600 entities, cached render under
  0.05 µs (concept measured).
- **Verdict: later.** First as the `/map` overlay (it takes no transcript
  rows), then as a section of the ui-layout panel. The same `MapState` can
  also feed the `wow_nearby` mini-map later, so the two maps do not diverge.

### 6. ui-quest-tracker: later

`frame-120.txt` (the widget, then the side overlay composited on a fake
transcript):

```text
── widget (setWidget aboveEditor) · width 120 · 6 lines ────────────────────────────────────────────────────────────────
━━ Quests 4/25 ──────────────────────────────────────────────────────────────────────────── 17s 42c bags 12/16 4 free ━━
 ✓ [1] Reclaiming Sunstrider… Mana Wyrm        ████████████████████ 8/8         ? giver Magistrix Erona 2.4y ↑
   ? turn in at Magistrix Erona 2.4y ↑ (accepted there)                         bags ▮▮▮▮▮▮▫▮▮▮▮▮▯▯▯▯
 ◐ [2] Unfortunate Measures   Lynx Collar      ███████▌░░░░░░░░░░░░ 3/8         ◆Lynx Collar ×3
 ◐ [4] A Fistful of Slivers   Arcane Sliver    ██████▋░░░░░░░░░░░░░ 2/6         ◆Arcane Sliver ×2
 ? quest 8330 (awaiting quer…                                                   ⚠Neophyte's Robe
── overlay (tui.showOverlay nonCapturing top-right) · panel 48 cols · 19 lines ─────────────────────────────────────────
 Turn in Reclaiming Sunstrider Isle, then keep collecting Lynx Collars.
                                                                       ╭─ Quest log 4/25 ─────────────────────────────╮
 wow_quests {}                                                         │ ✓ [1] Reclaiming Sunstrider Isle             │
   4 quests · 1 complete (8325) · giver Magistrix Erona 2.4y           │    Mana Wyrm      ██████████████ 8/8         │
                                                                       │    ? turn in Magistrix Erona 2.4y ↑          │
 8325 is complete and Erona is 2.4 yards ahead. Talking to her now.    │ ◐ [2] Unfortunate Measures                   │
                                                                       │    Lynx Collar    █████▎░░░░░░░░ 3/8         │
 wow_talk {"guid":"0xf130003bae004980"}                                │ ◐ [4] A Fistful of Slivers                   │
   dialog gossip · 1 quest ready: Reclaiming Sunstrider Isle           │    Arcane Sliver  ████▋░░░░░░░░░ 2/6         │
                                                                       │ ? quest 8330 (awaiting query)                │
 wow_complete_quest {"questId":8325}                                   ├─ Nearby ─────────────────────────────────────┤
   rewarded 100 XP, 30c · choose 1 of 2 items                          │ ? nearest giver Magistrix Erona 2.4y ↑       │
                                                                       ├─ Bags ───────────────────────────────────────┤
 Choosing the reward, then heading back to the lynx dens south-west.   │ 17s 42c   12/16 4 free                       │
 Turn in Reclaiming Sunstrider Isle, then keep collecting Lynx Collars.│ ▮ ▮ ▮ ▮ ▮ ▮ ▫ ▮ ▮ ▮ ▮ ▮ ▯ ▯ ▯ ▯              │
                                                                       │ ◆Lynx Collar ×3                              │
 wow_quests {}                                                         │ ◆Arcane Sliver ×2                            │
   4 quests · 1 complete (8325) · giver Magistrix Erona 2.4y           │ ⚠Neophyte's Robe                             │
                                                                       │  Sunstrider Handguards                       │
 8325 is complete and Erona is 2.4 yards ahead. Talking to her now.    ╰──────────────────────────────────────────────╯

 wow_talk {"guid":"0xf130003bae004980"}
   dialog gossip · 1 quest ready: Reclaiming Sunstrider Isle
```

- **Answers:** quest state needing `quests --json` plus `query-quest`;
  turn-in checks by diffing `inventory` and `experience`; free bag slots;
  finding the quest NPC by decoding `npcFlags`; M5's 107 legs on the way back
  to Erona (concept).
- **Feasibility:** feasible-with-work. The core does not know the turn-in
  NPC (`CMSG_QUESTGIVER_STATUS_QUERY` is never sent; no `STATUS_MULTIPLE`
  handler); kill objective names need a creature-name cache; gameobject
  objectives are skipped (concept, read there). The side panel is an
  occluding overlay and must follow the `hideOverlay` rules (read, confirmed
  above).
- **Cost:** cached 0.03-0.05 µs; rebuild 0.3-0.8 ms (concept measured).
- **Verdict: later.** In round 1 the `wow_quests` renderer (concept 1)
  already joins titles, objectives and counts. The tracker moves into the
  ui-layout panel in round 2, and its "turn in at" row waits for the
  quest-giver status protocol work.

### 7. ui-terrain-minimap: later (as a layer; drop the standalone widget)

`frame-120.txt` (the no-colour mode: one glyph per terrain class; the colour
version is in the HTML):

```text
╭ terrain N↑ 120×80 yd ──────────────────────────────────────────────────────────────────────────────────────────────── 
│................................................:::#:v::#::: you ↖ 10349.6, -6357.3, z33.4 pred                        
│..............................................:###::::w::z:: ..walk 82% ::roof 14% ^^steep 1% ##wall 3%                
│......◎+.................................f..:::###:::::s:::: ──────────────────────────────────────────────────────────
│........+..................................:::::..:::::::... ◎  57yd ↖ Mana Wyrm L1 76%                                
│..........++..............................::::.g............ b!  4yd ↗ Magistrix Erona L5                              
│..^^^##:.....+............................:::............... c  23yd ↘ Cat L1                                          
│^^^^####:.....++........................#:::::.............# d  25yd → Sunstrider Guardian L65 ▲5                      
│^^###^##.........+.....#.................:::::...........##. e  29yd → Sunstrider Guardian L65 ▲5                      
│^^^^^^............+.++#..................:d:::........n..... f! 39yd ↗ Marsilla Dawnstar L5 ▲4                         
│:......................++.+#+..b..........:::::............. g$ 42yd ↗ Shara Sunwing L5 ▲5                             
│...............:..............↖...........:::##:...........t h  43yd → Imp Minion L5 ▲5                                
│..........:::^:::#....##...................:e####........... i  45yd → Yasmine Teli'Larien L5 ▲5                       
│.........:::::::::..........#...........c.#.:######hi....... j  46yd ↑ Sunstrider Guardian L65                         
│........::::::::#............................#::::####m::#:: k  47yd ↑ Cat L1                                          
│.......::::#::::::..............................:::::::::::: l  49yd ↘ Mana Wyrm L1                                    
│........::....:::::..............................#.::::::::: mT 49yd → Summoner Teli'Larien L5 ▲5                      
│..x......................................................... n  49yd → Sunstrider Guardian L65 ▲5                      
│.................................:.........................* o  51yd ↖ Sunstrider Guardian L65                         
│.............................^^#^^:#........................ p  54yd ↖ Cat L1                                          
│............................^^^##^^...........l............. +29 more · 6592 nav queries 24ms · 4s old                 
```

- **Answers:** position and surroundings needing jq; terrain refusals
  planned "column by column in prose"; the roadmap's layer 2 (navmesh
  pathability shading) (concept). The `.txt` grid can also be a text answer
  for the model (inferred there).
- **Feasibility:** feasible-with-work. The native path works offline
  (measured there). Limits: only map 530 (and a dungeon) has nav data;
  first tile loads block the event loop for 130-200 ms through synchronous
  `bun:ffi`; `findHeights` is not a walkability test, so it needs a flood
  fill; water is inferred from "off navmesh"; raw truecolor ignores the
  256-colour theme mode (concept, measured and read there).
- **Cost:** 3.8-21.6 ms of nav queries per grid; render 3-8 ms first,
  recompose 2.2-4.2 ms (concept measured).
- **Verdict: later.** Build it as a terrain layer under the tactical map in
  the ui-layout panel or the `/map` overlay, sampled in a Worker or at idle
  time. Drop the 20-row `aboveEditor` form.

## Round-2 composition (for reference, not drawn)

At 160 columns in fullscreen mode: the transcript and its tool renderers on
the left; a 44-column ui-layout panel on the right holding the tactical map
(with the terrain layer when map 530 data exists), the nearby list and the
quest tracker; the event ticker above the editor; the unit-frames footer at
the bottom. Below 110 columns the panel hides and the round-1 layout
remains (ui-layout measured this tier at 100 and 80 columns).

## Unknowns

- How Orca's terminal pane renders Pi's alt screen, and what F2 sends
  through Orca and Blink: could not determine.
- East Asian Ambiguous glyphs (`◆ ◈`) and emoji-presentation glyphs
  (`⚔ ☠`) in the maintainer's font: not tested.
- No concept ran inside a live `InteractiveMode` with a game login. ui-layout
  booted a real `InteractiveMode` on a fake terminal with fixture data.
- Light theme: not rendered by any concept.
