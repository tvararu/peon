# Server-side Peon

Status: deferred. This note records the idea; it is not a design or a
spike.

## The idea

Run Peon inside the worldserver as an AzerothCore module, written in C++,
instead of or alongside the 3.3.5a client it is today. The agent would
drive a character through the server's own objects, the way Playerbots
drives its bots, and could reuse Playerbots code for sessions, actions and
commands.

## What it would change

- It skips the network protocol. Core, today the only way Peon reaches the
  game, becomes one of two: a client over the wire, or a module in the
  server.
- It is C++ built against AzerothCore, not TypeScript, and ships with the
  server build rather than as a Bun program.
- It conflicts with the `AGENTS.md` rule to build client capabilities and
  never edit server data to fake them. A module runs with server
  authority, so every capability would need a rule for what it may touch.

## What the server upgrade found about Playerbots

The facts come from the upgrade audit in the server reference clone
(`docs/upgrades/2026-09-27-audit.md`, section 8), which the maintainer used
to keep Playerbots.

- Reuse: the parts a Peon module could build on are the `PlayerbotsScript`
  hooks, bot sessions (a `WorldSession` with no socket, as
  `PlayerbotMgr.cpp` creates them), and `PlayerbotCommandServer`, a TCP
  command channel on port 8888. mod-playerbots is large, about 1,400
  source files.
- Fork friction: Playerbots needs its own fork of the core. The fork
  carries 145 commits, about 1,500 lines over 69 files in `src/`, and lags
  azerothcore/master. The upgrade covered 1,023 core commits and carried
  the maintainer's GM reply patch, which breaks on upgrades.
  mod-playerbots is moving toward plain core, but is not there.
- Cost: the audit measured 5.7 GiB RSS and about one busy core at idle
  with about 393 bots online; the worldserver uses 2.1 GiB before bots log
  in.

## What would reopen it

- The client path hits a limit the protocol cannot get past, such as
  latency or scale for many agents at once.
- mod-playerbots runs on plain azerothcore/master, so a module no longer
  ties Peon to a fork.
- The maintainer relaxes the client-capabilities rule for a server-side
  mode.
