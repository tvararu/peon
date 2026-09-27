# Glyph sets for the Pi harness UI

> Record copy for the [Pi harness epic spec](../2026-09-26-pi-harness-epic-design.md),
> taken 2026-09-26 from the epic's scratch notes. `HANDOVER.md` (the
> coordinator's working notes) was not kept: its rulings R1-R38 are the
> spec's Decisions section. Paths under `~/.cache/pi-epic-scratch/`, and
> scratch files in the checkout's `tmp` directory other than the copies in
> this directory, were not kept. Wrapper, account and eval paths in that
> directory name outputs that the described tools write at run time.
> `src/...` paths before the workspace split now live under
> `packages/<pkg>/src/`.


`glyphs.ts` maps 83 semantic names to three glyph sets: `nerd` (Nerd Fonts
v3), `unicode` (standard symbols, no emoji presentation) and `ascii`. Every
glyph in every set is one terminal cell wide (measured, below). The module
also gives the Nerd class name and codepoint of each glyph as a second
record (`nerdClasses`), the set selector (`resolveGlyphSet`) and the reverse
map for eval graders (`glyphName`, `glyphNamesByChar`, `tagNerdGlyphs`).

Evidence marks: **measured** means a command ran here and gave the result.
**Read** means from source or data files, with the path. **Inferred** means
neither.

## Source of the codepoints

- `glyphs.ts` is generated, not typed by hand. The generator
  (`~/.cache/pi-epic-scratch/glyphs/gen.ts`) reads each class name from
  `spec.ts` in the same directory and looks it up in Nerd Fonts'
  `glyphnames.json` v3.4.0 (downloaded from the `v3.4.0` tag). A missing
  class stops the generator. Three first choices were missing and were not
  used: `md-halo`, `md-angel`, `md-sparkles` (measured).
- All 83 classes exist at the same codepoint in `glyphnames.json` v3.0.0
  too (measured), so the set works with any Nerd Font v3.x (inferred). Three
  picks were changed to get there: `md-heart` (U+F08D0 in the v3.0.0 table,
  U+F02D1 in v3.4.0) became `fa-heart` U+F004, and `fa-dragon` U+EEF8 and
  `fa-scroll` U+EF0D (absent from v3.0.0) became `md-skull_crossbones` and
  `md-script_text_outline`.
- 81 glyphs are `nf-md-*` in Supplementary Private Use Area-A
  (U+F0000-U+FFFFD). Two are `nf-fa-*` (`fa-heart` U+F004, `fa-shield`
  U+F132) in the BMP Private Use Area (measured).
- `nerd` and `unicode` have no collisions: each glyph maps to exactly one
  name (measured). `ascii` has 17 shared characters (listed below).

## Table

| Semantic name | Nerd class | Nerd code | Unicode | Unicode code | ASCII |
| --- | --- | --- | --- | --- | --- |
| `hostile` | `nf-md-account_alert` | U+F0005 | ✕ | U+2715 | `x` |
| `neutral` | `nf-md-account_outline` | U+F0013 | ○ | U+25CB | `o` |
| `friendly` | `nf-md-account_check` | U+F0008 | ● | U+25CF | `+` |
| `party` | `nf-md-account_group` | U+F0849 | ◒ | U+25D2 | `p` |
| `self` | `nf-md-crosshairs_gps` | U+F01A4 | ⌖ | U+2316 | `@` |
| `target` | `nf-md-target` | U+F04FE | ◎ | U+25CE | `*` |
| `dead` | `nf-md-skull_outline` | U+F0BC8 | ☓ | U+2613 | `%` |
| `lootable` | `nf-md-treasure_chest` | U+F0726 | ◈ | U+25C8 | `$` |
| `gameObject` | `nf-md-rhombus_outline` | U+F070C | ▣ | U+25A3 | `o` |
| `elite` | `nf-md-crown` | U+F01A5 | ♛ | U+265B | `E` |
| `rare` | `nf-md-diamond_stone` | U+F01C8 | ◇ | U+25C7 | `R` |
| `boss` | `nf-md-skull_crossbones` | U+F0BC6 | ♚ | U+265A | `B` |
| `idle` | `nf-md-sleep` | U+F04B2 | ∙ | U+2219 | `z` |
| `questAvailable` | `nf-md-exclamation_thick` | U+F1238 | ! | U+0021 | `!` |
| `questComplete` | `nf-md-help` | U+F02D6 | ? | U+003F | `?` |
| `questInProgress` | `nf-md-progress_question` | U+F1522 | ◐ | U+25D0 | `~` |
| `questDone` | `nf-md-progress_check` | U+F0995 | ✓ | U+2713 | `v` |
| `questFailed` | `nf-md-progress_close` | U+F110A | ✗ | U+2717 | `x` |
| `questLog` | `nf-md-script_text_outline` | U+F0BC3 | § | U+00A7 | `Q` |
| `questgiver` | `nf-md-account_voice` | U+F05CB | ¡ | U+00A1 | `Q` |
| `vendor` | `nf-md-cart` | U+F0110 | ¤ | U+00A4 | `V` |
| `trainer` | `nf-md-school` | U+F0474 | ✎ | U+270E | `T` |
| `flightMaster` | `nf-md-bird` | U+F15C6 | ⌃ | U+2303 | `F` |
| `health` | `nf-fa-heart` | U+F004 | ♡ | U+2661 | `h` |
| `mana` | `nf-md-water` | U+F058C | ≈ | U+2248 | `m` |
| `rage` | `nf-md-fire` | U+F0238 | ∆ | U+2206 | `r` |
| `energy` | `nf-md-lightning_bolt` | U+F140B | ϟ | U+03DF | `e` |
| `xp` | `nf-md-star_four_points` | U+F0AE2 | ✶ | U+2736 | `X` |
| `gold` | `nf-md-alpha_g_circle` | U+F0BFE | ⓖ | U+24D6 | `g` |
| `silver` | `nf-md-alpha_s_circle` | U+F0C22 | ⓢ | U+24E2 | `s` |
| `copper` | `nf-md-alpha_c_circle` | U+F0BF2 | ⓒ | U+24D2 | `c` |
| `bag` | `nf-md-bag_personal` | U+F0E10 | ⊔ | U+2294 | `b` |
| `item` | `nf-md-cube_outline` | U+F01A7 | ◆ | U+25C6 | `i` |
| `loot` | `nf-md-sack` | U+F0D2E | ⊛ | U+229B | `L` |
| `sword` | `nf-md-sword` | U+F04E5 | † | U+2020 | `/` |
| `spell` | `nf-md-auto_fix` | U+F0068 | ✧ | U+2727 | `&` |
| `cast` | `nf-md-magic_staff` | U+F1844 | ✦ | U+2726 | `~` |
| `shield` | `nf-fa-shield` | U+F132 | ⛨ | U+26E8 | `]` |
| `buff` | `nf-md-chevron_double_up` | U+F013F | ⇈ | U+21C8 | `+` |
| `debuff` | `nf-md-chevron_double_down` | U+F013C | ⇊ | U+21CA | `-` |
| `cooldown` | `nf-md-timer_sand` | U+F051F | ◴ | U+25F4 | `:` |
| `whisper` | `nf-md-email_outline` | U+F01F0 | ✉ | U+2709 (Emoji, text default) | `w` |
| `say` | `nf-md-message_text` | U+F0369 | » | U+00BB | `>` |
| `partyChat` | `nf-md-forum` | U+F028C | ◫ | U+25EB | `P` |
| `guild` | `nf-md-shield_crown` | U+F18BC | ♜ | U+265C | `G` |
| `system` | `nf-md-cog` | U+F0493 | ※ | U+203B | `#` |
| `warning` | `nf-md-alert` | U+F0026 | ⚠ | U+26A0 (Emoji, text default) | `!` |
| `error` | `nf-md-close_octagon` | U+F015C | ⊘ | U+2298 | `E` |
| `death` | `nf-md-skull` | U+F068C | ☠ | U+2620 (Emoji, text default) | `D` |
| `ghost` | `nf-md-ghost` | U+F02A0 | ◌ | U+25CC | `&` |
| `spiritHealer` | `nf-md-hands_pray` | U+F0579 | ☼ | U+263C | `A` |
| `corpse` | `nf-md-grave_stone` | U+F0BA2 | ✚ | U+271A | `C` |
| `kill` | `nf-md-target_account` | U+F0BD0 | ‡ | U+2021 | `k` |
| `route` | `nf-md-map_marker_path` | U+F0D20 | ┄ | U+2504 | `.` |
| `waypoint` | `nf-md-map_marker_outline` | U+F07D9 | ◦ | U+25E6 | `,` |
| `mapPin` | `nf-md-map_marker` | U+F034E | ⚑ | U+2691 | `M` |
| `rangeRing` | `nf-md-radius_outline` | U+F0CC1 | ◯ | U+25EF | `O` |
| `compassN` | `nf-md-arrow_up` | U+F005D | ↑ | U+2191 | `^` |
| `compassNE` | `nf-md-arrow_top_right` | U+F005C | ↗ | U+2197 (Emoji, text default) | `/` |
| `compassE` | `nf-md-arrow_right` | U+F0054 | → | U+2192 | `>` |
| `compassSE` | `nf-md-arrow_bottom_right` | U+F0043 | ↘ | U+2198 (Emoji, text default) | `\` |
| `compassS` | `nf-md-arrow_down` | U+F0045 | ↓ | U+2193 | `v` |
| `compassSW` | `nf-md-arrow_bottom_left` | U+F0042 | ↙ | U+2199 (Emoji, text default) | `/` |
| `compassW` | `nf-md-arrow_left` | U+F004D | ← | U+2190 | `<` |
| `compassNW` | `nf-md-arrow_top_left` | U+F005B | ↖ | U+2196 (Emoji, text default) | `\` |
| `facingN` | `nf-md-arrow_up_thick` | U+F005E | ▲ | U+25B2 | `^` |
| `facingNE` | `nf-md-arrow_top_right_thick` | U+F09C6 | ◥ | U+25E5 | `/` |
| `facingE` | `nf-md-arrow_right_thick` | U+F0055 | ► | U+25BA | `>` |
| `facingSE` | `nf-md-arrow_bottom_right_thick` | U+F09BA | ◢ | U+25E2 | `\` |
| `facingS` | `nf-md-arrow_down_thick` | U+F0046 | ▼ | U+25BC | `v` |
| `facingSW` | `nf-md-arrow_bottom_left_thick` | U+F09B8 | ◣ | U+25E3 | `/` |
| `facingW` | `nf-md-arrow_left_thick` | U+F004E | ◄ | U+25C4 | `<` |
| `facingNW` | `nf-md-arrow_top_left_thick` | U+F09C4 | ◤ | U+25E4 | `\` |
| `levelUp` | `nf-md-chevron_triple_up` | U+F0DBC | ⇑ | U+21D1 | `U` |
| `combat` | `nf-md-sword_cross` | U+F0787 | ⚔ | U+2694 (Emoji, text default) | `#` |
| `flee` | `nf-md-run_fast` | U+F046E | ⇇ | U+21C7 | `f` |
| `damageIn` | `nf-md-arrow_down_bold_circle` | U+F0047 | ▾ | U+25BE | `v` |
| `damageOut` | `nf-md-arrow_up_bold_circle` | U+F005F | ▴ | U+25B4 | `^` |
| `jevDecision` | `nf-md-head_lightbulb` | U+F1344 | ◊ | U+25CA | `j` |
| `runRunning` | `nf-md-progress_clock` | U+F0996 | ⟳ | U+27F3 | `*` |
| `runDone` | `nf-md-check_circle` | U+F05E0 | √ | U+221A | `+` |
| `runFailed` | `nf-md-close_circle` | U+F0159 | ✘ | U+2718 | `x` |
| `clock` | `nf-md-clock_outline` | U+F0150 | ◷ | U+25F7 | `@` |

"Emoji, text default" marks a codepoint with the Unicode `Emoji` property
but not `Emoji_Presentation`. It measures 1 everywhere below, and no set
adds U+FE0F. Some terminal and font setups can still draw these as colour
emoji two cells wide (inferred; the `ui-event-ticker` README makes the same
note for `⚔ ☠`). The concepts already use all eight (measured with `rg`), so
they stay. No glyph
in any set has `Emoji_Presentation` (measured).

Font coverage of the `unicode` set (inferred, no font was tested): 51 of
its glyphs do not appear in the concepts yet (measured). Nine first picks from rare
blocks were replaced with glyphs from blocks that common monospace fonts
cover (Arrows, Geometric Shapes, Box Drawing, General Punctuation,
Latin-1): `⸸ ⤳ ⧗ ⎇ ⇶ ᶻ ‽ ☥ ⧉` became `† ┄ ◴ ◊ ⇇ ∙ ¡ ☼ ◫`, and `kill`
moved to `‡`. Some left may still show as boxes in a small font:
`⌖` self, `⛨` shield, `♛ ♚ ♜` elite, boss, guild, `ⓖ ⓢ ⓒ` money.
Check them in the target terminal before relying on the `unicode` set.

ASCII collisions (measured): `x` hostile/questFailed/runFailed, `o`
neutral/gameObject, `+` friendly/buff/runDone, `@` self/clock, `*`
target/runRunning, `E` elite/error, `!` questAvailable/warning, `~`
questInProgress/cast, `v` questDone/compassS/facingS/damageIn, `Q`
questLog/questgiver, `/` sword/compassNE/compassSW/facingNE/facingSW, `&`
spell/ghost, `>` say/compassE/facingE, `#` system/combat, `^`
compassN/facingN/damageOut, `\` compassSE/compassNW/facingSE/facingNW, `<`
compassW/facingW. The ASCII set is a fallback for humans. Position and
colour tell these apart on screen. A grader must not use it.

## Width measurements

Script: `~/.cache/pi-epic-scratch/glyphs/measure.ts`, run with Bun 1.4.2 on
openhubris. It imports the generated `glyphs.ts` (not a copy of the
strings). Raw rows: `widths.tsv` in this directory, one per set and name.

| Check | Result (measured) |
| --- | --- |
| pi-tui 0.87.1 `visibleWidth(glyph)` | 249 of 249 are 1 |
| `Bun.stringWidth(glyph)` | 249 of 249 are 1 |
| glibc `wcwidth(cp)` via `bun:ffi`, locale `C.UTF-8` | 249 of 249 are 1 |
| Code points per glyph | 249 of 249 are 1 |
| East Asian Width (`get-east-asian-width` 1.6.0) | nerd: 83 ambiguous. unicode: 37 ambiguous, 44 neutral, 2 narrow. ascii: 83 narrow |
| Glyphs replaced for width 0 or 2 | none |
| Replaced for other reasons | `runDone` `✔` U+2714 to `√` U+221A (`✔` has the `Emoji` property) |

pi-tui is the instance in `~/.cache/pi-epic-scratch/ui-layout/node_modules`.
glibc's `wcwidth` is what most Linux terminal programs use, but the
terminal emulator decides the real cell count. No terminal emulator was
measured, because the task rules exclude Orca terminals.

### How pi-tui treats Private Use Area width (read)

Paths are under
`~/.cache/pi-epic-scratch/ui-layout/node_modules/`.

1. `@earendil-works/pi-tui/dist/utils.js:208` `visibleWidth` segments the
   string into graphemes and sums `graphemeWidth` (`utils.js:148`).
2. `utils.js:34` `zeroWidthRegex` matches only `Default_Ignorable_Code_Point`,
   `Control`, `Mark` and `Surrogate`. PUA is general category `Co`, so it
   does not match, and `utils.js:157` does not return 0.
3. `utils.js:23` `couldBeEmoji` tests U+1F000-1FBFF, U+2300-23FF,
   U+2600-27BF, U+2B50-2B55, U+FE0F, and length over 2. A Supplementary PUA
   glyph is two UTF-16 units, so the length test does not fire, and no range
   covers PUA. `utils.js:161` does not return 2.
4. `utils.js:176` `let width = eastAsianWidth(cp)`. In
   `get-east-asian-width/index.js:15`, `eastAsianWidth` returns 2 only for
   Fullwidth, Wide, or Ambiguous when `ambiguousAsWide` is true. pi-tui does
   not pass that option, and PUA is East Asian Width Ambiguous
   (`lookup.js:54` `isAmbiguous`). So every PUA glyph is width 1.

Consequence: a terminal set to draw ambiguous-width characters as two cells
(a CJK option in some terminals) breaks every Nerd glyph and 37 of the
unicode glyphs. pi-tui then miscounts the line (inferred).

### Other traps

- An `nf-md-*` glyph is two UTF-16 code units: `nerd.sword.length` is 2,
  and `visibleWidth` is 1 (measured). One sample line of 23 cells has a
  `.length` of 26 (measured). Code that pads with `.length`, `padEnd` or
  `slice` drifts by one cell per glyph. pi-tui's wrap and truncate
  helpers go through `visibleWidth` (`utils.js:795-975`, read), so code
  inside the TUI is safe. Hand-built padding in the concepts must use
  `visibleWidth`.
- A cell width of 1 does not stop the glyph from being drawn wider. Nerd
  Font variants other than "Mono" draw many icons about 1.5 to 2 cells wide
  and overlap the next cell (inferred from Nerd Fonts documentation, not
  measured here). Put a space or a non-glyph after an icon, or tell users to
  use a `Nerd Font Mono` family.
- Without a Nerd Font the terminal draws PUA glyphs as boxes or blanks.
  The width stays 1, so layout does not break, but the icons carry no
  meaning (inferred). This is the reason for the `unicode` fallback.

## Selection

`resolveGlyphSet(flag, env, warn)` in `glyphs.ts`, measured with four cases
in `measure.ts`:

- `--glyphs nerd|unicode|ascii` wins.
- Otherwise `TUICRAFT_GLYPHS` with the same values.
- Otherwise `nerd`.
- An unknown value gives `nerd` and one warning line, for example
  `--glyphs=emoji is not one of nerd|unicode|ascii; using nerd`. The harness
  should send `warn` to stderr, not crash (proposal).

Proposal for the harness: resolve the set once at start-up, put the
`GlyphSet` in the render context next to the theme, and have every
component read `glyphs.<name>` instead of a literal. Only an extension
that renders reads it, so RPC and print modes need nothing. Record the
chosen set in the session header, so a transcript or grader knows which
table applies.

## Eval graders

`orca-ide terminal read --screen` returns the cell grid as text, so each
width-1 Nerd glyph comes back as its raw codepoint (inferred from how a
cell grid is read out, not run here, per the task rules). A grader that
matches on words or on the concept's Unicode symbols then sees an
unprintable-looking PUA character.

Proposal:

1. Run eval sessions with `--glyphs nerd` (the default), so graders see the
   same screen as the user.
2. Before matching, pass the screen through `tagNerdGlyphs(screen)`, which
   replaces each Nerd glyph with `<name>`. For example
   `\u{F0005} Springpaw 8y\u{F005C}` becomes
   `<hostile> Springpaw 8y<compassNE>` (measured). Rubrics then say
   `<hostile>` and `<compassNE>`, not a codepoint.
3. `glyphName(char)` gives the name of one character. `glyphNamesByChar`
   builds the map for any set. For `unicode` it is one-to-one too, so a
   grader can also run a unicode session. Never grade an `ascii` session by
   glyph, because 17 of its characters stand for more than one name.
4. The graders must import the same `glyphs.ts` the harness renders with.
   A copied table goes stale when a glyph changes.

## Files

- `glyphs.ts`: the module. It type-checks under the repository's strict
  flags (`tsc --noEmit`, measured exit 0).
- `widths.tsv`: raw width measurements.
- Scratch, not in the repository: `~/.cache/pi-epic-scratch/glyphs/`
  (`spec.ts`, `gen.ts`, `measure.ts`, `glyphnames.json` v3.4.0,
  `glyphnames-3.0.0.json`).
