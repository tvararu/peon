# Harness UI pane smoke (U11b)

Run 2026-09-27T03:00:06Z at 8cb5068, a throwaway soap account (preset eversong10), glyphs nerd, 1 Orca pane.

| Check | Result |
| --- | --- |
Footer mount: footer

| footer row 1 shows <self> and the character | PASS |
| footer row 4 (chrome) is on screen | PASS |
| V5: the setFooter footer is the last screen row | PASS |
| footer row 3 shows the place | PASS |
| ticker head is drawn above the editor | PASS |
| --wake off shows wake:off in the footer | PASS |
| /now shows a notice | PASS |
| /say logs human/input | PASS |
| /log shows the game log notice | PASS |
| /snapshot writes the file | PASS |
| /stop answers | PASS |
| /wake on shows wake:on in the footer | PASS |

Last frame (tagNerdGlyphs):

~~~text
$ bun packages/harness/src/entry.ts --profile tmp/ui-smoke/profile.json --run-dir tmp/ui-smoke/run --glyphs nerd --wake
off
Codex login: valid until 2026-09-30 20:20 UTC (omp).
 Warning: fd not found. Offline mode enabled, skipping download.
 <system> 03:00:07 Connected as Fgkliiglgab. (ctrl+o)
 Game log since your last turn started: 6 rows.
 <system> 03:00:07 Connected as Fgkliiglgab. (ctrl+o)
 <system> 03:00:08 In world as Fgkliiglgab, level 10 Blood Elf Priest, on map 530. (ctrl+o)
 <self> 03:00:10 Human: /now (ctrl+o)
 <self> 03:00:11 Human: /say harness ui smoke (ctrl+o)
 <say> 03:00:11 Fgkliiglgab says: "harness ui smoke" (ctrl+o)
 <self> 03:00:13 Human: /log (ctrl+o)
 Wake is on.
<idle> no run │ <kill> 0 kills <xp> +0 xp
   ·
   ·
 10s <system> Connected as Fgkliiglgab.
  9s <system> In world as Fgkliiglgab, level 10 Blood Elf Priest, on map 530.
  7s <say> Fgkliiglgab says: "harness ui smoke"
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
<self> Fgkliiglgab 10 Priest  <health>████████████████217/217  <mana>████████████████607/607  <xp>··········0%  <idle> idle
<target> no target
<mapPin> Eversong Woods · Fairbreeze Village  8735,-6685 <facingW> server 10s  <gold>5 <silver>0 <copper>0
openai-codex/gpt-6-luna · high · ctx 0% · wake:on · glyphs:nerd · log 11 rows
~~~
| no password in the run dir | PASS |
