# Terminal UI design

Status: proposal. These mockups show a possible redesign of the harness
terminal UI; they are not the current UI, which
[docs/harness.md](../harness.md#screen) describes.

## The file

[2026-09-27-terminal-ui-design.html](2026-09-27-terminal-ui-design.html)
is the export of a Claude Design session on the terminal UI goals: a
cockpit for fights, an overworld for travel, overlays for the game's
panels, and a layout that fits both 160×48 and 80×24 terminals. The
maintainer ran the session; the file is stored as exported.

Open it in a browser. It needs JavaScript but no network: each frame is
a gzipped, base64-encoded page carrying its own copy of React 18,
ReactDOM and the Claude Design runtime, which makes the file about
2.4 MB. The frames ask for the Iosevka Nerd Font and fall back to the
system monospace font when it is not installed.

## Sections

Terminal frames, 160×48 unless marked:

1. Cockpit · calm fight, one add coming
2. Cockpit · combat, three on you
3. Cockpit · typing a steer mid-fight (TALK)
4. Cockpit · taking over by hand (PLAY)
5. Overworld · driving by hand (PLAY)
6. Overworld · the agent runs
7. Overworld · long walk, zoom 1:4
8. Overworld · stuck, server corrections
9. Overworld · death, corpse run
10. Overworld · whispers and invite
11. Overlay · character (C) and bags (B)
12. Overlay · quest log (L) and spellbook (P)
13. Overlay · zone map (M)
14. Overlay · NPC dialog, quest turn-in
15. Overlay · vendor, sell junk, repair
16. Other · first run, no character yet
17. Other · disconnect and reconnect
18. 80×24 · combat, VIEW
19. 80×24 · travel, MAP

Notes:

20. Build plan · widgets → Pi extensions
21. Keymap · every key per mode
22. `--ui log` · spec for parent models
23. Map data check · decisions
24. Fallbacks · glyphs, colours, log mode
