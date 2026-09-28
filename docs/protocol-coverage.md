# Protocol coverage

Every `GameOpcode` and what core does with it, split by owner. Each
code area's opcodes, the ones its `opcodes.ts` lists in `owns`, are in
`docs/protocol-coverage/<area>.md`; the opcodes no area owns are in
[core.md](protocol-coverage/core.md). `mise test` fails when a file is
stale or has no owner; rewrite them all with `mise protocol:coverage`,
which also prints the counts per area and in total. How an area claims
its opcodes is in [protocol.md](protocol.md#add-an-area).

Each row gives the opcode, its name, its direction and its status:

- `dead`: in the owning area's `dead` list; the server never sends it
  or never reads it.
- `stub`: in `STUBS` or in the owning area's `stubs`.
- `handled`: the world handlers register a real handler for it, or
  core source outside the opcode table and `STUBS` names it (a sent
  client opcode, an awaited reply).
- `missing`: none of these.

The live column reads `not seen live` for an opcode in the owning
area's `unseen` list: a test built from the AzerothCore writer proves
it, and no live run has shown it yet.
