# core-b: place state and handle runs (key: core-b)

Plan index: [2026-09-26-pi-harness-epic-plan.md](../2026-09-26-pi-harness-epic-plan.md).

Area overview:
1. C6a adds a devtools generator that reads the 3.3.5 `Area` enum from `wow_messages` `area.wowm` and writes `packages/core/src/wow/data/area-names.json` (id → name). It also adds a biome ignore for that file.
2. C6b parses `SMSG_INIT_WORLD_STATES`, keeps the last place on `WorldConn`, fills `getPlaceState()` and emits `place_changed`. It also removes the stub row and makes the daemon ignore the event.
3. C7a fills `lootCorpse(guid, signal)` in `client-runs.ts` over the tested `loot-run.ts`. C7b fills `recoverCorpse(signal)` over `corpse-run.ts` and `corpse-legs.ts`.
4. Both runs use the same guard: `busy` while the encounter cycle runs or while another handle run is active, and `cancelled` when the signal aborts.
5. Order: C6a → C6b and C7a → C7b. The two chains are disjoint and can run in parallel after C1 (contract 4.1, wave 1 and 2).

## Contract issues

These are defects or gaps found while planning. The contract is not changed. The plan works around each one as stated.

1. **The area goes stale inside a zone.** AzerothCore sends `SMSG_INIT_WORLD_STATES` only at login and when the zone changes (`Player::UpdateZone`, `PlayerUpdates.cpp:1266-1272` in `../azerothcore-wotlk-playerbots`, read: "only if really enters to new zone, not just area change"). So `areaId` and `area` are the sub-area at zone entry, and `place_changed` never fires for an area change alone. Contract 1.3 implies the area follows the player. The plan builds 1.3 as written. The consumers (A3 `placeView`, L10 `[now]`, the `look` line 1, U2 footer, eval `t0-where-am-i`) must accept a stale area or show the zone only. The coordinator should decide this.
2. **The table has 2307 names, not 2308.** The 3.3.5 block has 2308 enum entries, but `NONE = 0` has no `display` (measured: `rg -c 'display ='` gives 2307 in lines 8187-15112 of `area.wowm`). The JSON has 2307 keys. Id 0 gives `undefined`.
3. **Import rule 0.2 cannot hold for the JSON.** Core may import "only `#wow/*`, `#lib/*`". `#wow/*` maps to `./src/wow/*.ts` (`packages/core/package.json`, read), so `#wow/data/area-names.json` resolves to `area-names.json.ts`, which does not exist. `client-place.ts` imports the table relatively: `import areaNames from "./data/area-names.json" with { type: "json" };`. Biome's restricted-import patterns do not match `./data/...` (read `biome.json`).
4. **Abort is not specified for the runs.** Contract 1.4 says C7 returns the `loot-run.ts` and `corpse-run.ts` results unchanged. These functions throw an `AbortError` when the signal aborts. The plan returns `cycleStop("cancelled")` when `signal.aborted` is true, which is the harness refusal name (contract 2.0, `cancelled`). Other errors still throw.
5. **`recoverCorpse` on a live character returns `life_unknown`.** `corpse-run.ts` `becomeGhost` stops with `life_unknown` for any life other than `dead` or `ghost`. The plan keeps this (contract 1.4: "unchanged"). B4 `recoverOp` must not read `life_unknown` as "life is unknown" when the character is alive.
6. **The daemon test file.** Contract 3.1 gives `packages/cli/src/daemon/events.ts` to C6b. Its tests are split by domain, so C6b adds its test to `packages/cli/src/daemon/events-control.test.ts` (there is no `events.test.ts`).
7. **Generator default path.** Contract 3.1 names `/home/deity/code/wow_messages/...` as the default input. The plan uses `join(homedir(), "code/wow_messages/wow_message_parser/wowm/world/enums/area.wowm")`. It is the same path on this host and does not put a user name in the source.
8. **Handler location.** The contract gives no file for the `SMSG_INIT_WORLD_STATES` handler. The plan puts `handleInitWorldStates` in `client-place.ts` (owned by C6b), so C6b creates no file outside section 3.1.
9. **C7 changes no protocol and no daemon behaviour.** The AGENTS.md live gate is not mandatory for C7a or C7b. C7b still has a scripted live probe (hedged, because `.die` permissions for GM level 2 are not verified). B6, B11 and the FINAL gate give the full live proof.

## Setup for the builder

- Work in an Orca child worktree of `epic/pi-harness` (contract 0.1). From the epic worktree: `orca-ide worktree create --name core-b --base-branch origin/epic/pi-harness --parent-worktree active --comment "owner: <builder>, core-b C6a-C7b" --agent omp`.
- Start only after C1 is on `epic/pi-harness`. Check: `packages/core/src/wow/client-place.ts` and `client-runs.ts` exist (C0), and `rg -n 'CycleStop' packages/core/src/wow/index.ts` finds the C1 export line.
- All commands run from the worktree root. `rg`, `/usr/bin/find` and `command head` are the search tools.
- After each commit, run `mise ci` and land the commit on `epic/pi-harness` the way the coordinator directs. Never merge PR #367.

---

## Task C6a: Area name table generator

**Design:** G6. **Needs:** C1. **Live gate:** none (tooling and data only).

**Files:**
- Create: `packages/devtools/src/area-names.ts`
- Test: `packages/devtools/src/area-names.test.ts`
- Create (generated): `packages/core/src/wow/data/area-names.json`
- Modify: `biome.json` (`files.includes`)

**Interfaces:**
- Consumes: `/home/deity/code/wow_messages/wow_message_parser/wowm/world/enums/area.wowm` (the 3.3.5 `enum Area : u32` block, lines 8187-15112, read).
- Produces:
  ```ts
  export type AreaNames = Record<string, string>;
  export function parseAreaNames(text: string, version = "3.3.5"): AreaNames;
  ```
  CLI: `bun packages/devtools/src/area-names.ts [<area.wowm>] [<out.json>]`, defaults `~/code/wow_messages/wow_message_parser/wowm/world/enums/area.wowm` and `packages/core/src/wow/data/area-names.json`.
  Data: `packages/core/src/wow/data/area-names.json`, a JSON object `{ "<id>": "<display name>" }` with 2307 keys.

**Steps:**

- [ ] **Step 1: Write the failing test.** Create `packages/devtools/src/area-names.test.ts`:

  ```ts
  import { describe, expect, test } from "bun:test";
  import { parseAreaNames } from "#tools/area-names";

  const wowm = `enum Area : u32 {
      NONE = 0;
      DUN_MOROGH = 1 {
          display = "Dun Morogh";
      }
  } {
      versions = "1.12";
  }

  enum Area : u32 {
      NONE = 0;
      ELWYNN_FOREST = 12 {
          display = "Elwynn Forest";
      }
      EVERSONG_WOODS = 3430 {
          display = "Eversong Woods";
      }
      SUNSTRIDER_ISLE = 3431 {
          display = "Sunstrider Isle";
      }
  } {
      rust_base_type = "true";
      versions = "3.3.5";
  }
  `;

  describe("parseAreaNames", () => {
    test("reads the 3.3.5 block by id", () => {
      expect(parseAreaNames(wowm)).toEqual({
        "12": "Elwynn Forest",
        "3430": "Eversong Woods",
        "3431": "Sunstrider Isle",
      });
    });

    test("reads another version block on request", () => {
      expect(parseAreaNames(wowm, "1.12")).toEqual({ "1": "Dun Morogh" });
    });

    test("skips an entry without a display name", () => {
      expect(parseAreaNames(wowm)).not.toHaveProperty("0");
    });

    test("throws when no block has the version", () => {
      expect(() => parseAreaNames(wowm, "2.4.3")).toThrow(
        "no Area enum for version 2.4.3",
      );
    });
  });
  ```

  The template literal must keep the leading spaces shown (the parser matches indented lines). Remove the two-space Markdown indent when you paste.

- [ ] **Step 2: Run it and see it fail.**
  `mise test packages/devtools/src/area-names.test.ts`
  Expected: the file fails to load with `Cannot find module '#tools/area-names'`.

- [ ] **Step 3: Implement.** Create `packages/devtools/src/area-names.ts`:

  ```ts
  import { homedir } from "node:os";
  import { join } from "node:path";

  export type AreaNames = Record<string, string>;

  type Block = { names: AreaNames; versions: string[] };
  type Scan = { blocks: Block[]; id?: string };

  const WOWM = "code/wow_messages/wow_message_parser/wowm/world/enums/area.wowm";
  const OUTPUT = "packages/core/src/wow/data/area-names.json";
  const ENUM_START = /^enum Area : u32 \{$/;
  const ENTRY = /^\s+[A-Z0-9_]+ = (\d+)(?: \{|;)$/;
  const DISPLAY = /^\s+display = "(.*)";$/;
  const VERSIONS = /^\s+versions = "([^"]*)";$/;
  const SPACES = /\s+/;

  export function parseAreaNames(text: string, version = "3.3.5"): AreaNames {
    const block = areaBlocks(text).find((b) => b.versions.includes(version));
    if (!block) throw new Error(`no Area enum for version ${version}`);
    return block.names;
  }

  function areaBlocks(text: string): Block[] {
    const scan: Scan = { blocks: [] };
    for (const line of text.split("\n")) scanLine(scan, line);
    return scan.blocks;
  }

  function scanLine(scan: Scan, line: string): void {
    if (ENUM_START.test(line)) scan.blocks.push({ names: {}, versions: [] });
    const block = scan.blocks.at(-1);
    if (!block) return;
    const entry = ENTRY.exec(line);
    const display = DISPLAY.exec(line);
    const versions = VERSIONS.exec(line);
    if (entry) scan.id = entry[1];
    if (display && scan.id !== undefined)
      block.names[scan.id] = display[1] ?? "";
    if (versions) block.versions = (versions[1] ?? "").split(SPACES);
  }

  async function main(): Promise<void> {
    const [input = join(homedir(), WOWM), output = OUTPUT] = Bun.argv.slice(2);
    const names = parseAreaNames(await Bun.file(input).text());
    await Bun.write(output, `${JSON.stringify(names, null, 2)}\n`);
    console.log(`${Object.keys(names).length} area names written to ${output}`);
  }

  if (import.meta.main) await main();
  ```

- [ ] **Step 4: Run the test and see it pass.**
  `mise test packages/devtools/src/area-names.test.ts`
  Expected: 4 pass, 0 fail.

- [ ] **Step 5: Generate the table.**
  `mkdir -p packages/core/src/wow/data && bun packages/devtools/src/area-names.ts`
  Expected output: `2307 area names written to packages/core/src/wow/data/area-names.json`.
  Check it: `jq 'length' packages/core/src/wow/data/area-names.json` prints `2307`; `jq -r '."3430", ."3431", ."3433", ."12", ."87"' packages/core/src/wow/data/area-names.json` prints `Eversong Woods`, `Sunstrider Isle`, `Ghostlands`, `Elwynn Forest`, `Goldshire`. The file is about 66 KB (`wc -c`; the parse logic was dry-run on this host while planning and gave 2307 names and 66256 bytes).

- [ ] **Step 6: Exclude the table from biome.** In `biome.json`, change `"files": { "includes": ["packages/**"] }` to:

  ```json
  "files": {
    "includes": ["packages/**", "!**/wow/data/area-names.json"]
  },
  ```

  Check: `mise format` and `mise lint` pass, and `bunx biome check packages/core/src/wow/data/area-names.json` reports that no file was processed (or ignored).

- [ ] **Step 7: Full gate.**
  `bun run tsc --noEmit -p packages/devtools` exits 0. `mise ci` passes.

- [ ] **Step 8: Commit.**
  ```bash
  git add packages/devtools/src/area-names.ts packages/devtools/src/area-names.test.ts packages/core/src/wow/data/area-names.json biome.json
  ```
  ```bash
  mise exec -- git commit -m "chore: Generate the area name table" -m "The place state needs zone and area names, and AreaTable.dbc is not in the configured data directory. The wow_messages 3.3.5 Area enum gives 2307 names without a DBC."
  ```

---

## Task C6b: Place state from SMSG_INIT_WORLD_STATES

**Design:** G6. **Needs:** C6a (and C0/C1 through it). **Live gate:** yes (protocol and daemon change).

**Files:**
- Create: `packages/core/src/wow/protocol/world-states.ts`
- Test: `packages/core/src/wow/protocol/world-states.test.ts`
- Modify: `packages/core/src/wow/client-place.ts` (body; the C0 stub is replaced in full)
- Test: `packages/core/src/wow/client-place.test.ts` (create)
- Modify: `packages/core/src/wow/world-conn.ts` (one field)
- Modify: `packages/core/src/wow/client-handlers.ts` (one registration)
- Modify: `packages/core/src/wow/protocol/stubs.ts` (remove one row)
- Test: `packages/core/src/wow/protocol/stubs.test.ts` (one test)
- Modify: `packages/cli/src/daemon/events.ts` (`onControlEvent` ignores `place_changed`)
- Test: `packages/cli/src/daemon/events-control.test.ts` (one test)

**Interfaces:**
- Consumes:
  ```ts
  // C0, packages/core/src/wow/control.ts
  export type ControlEventType = ... | "place_changed";
  export type ControlEvent = { type: ControlEventType; state: ControlState; reason?: string };
  // C0, packages/core/src/wow/client.ts
  getPlaceState: () => PlaceState;
  // existing
  export class PacketReader { uint16LE(): number; uint32LE(): number }
  conn.events.control: Emitter<[ControlEvent]>;
  conn.control?: ControlRuntime; // snapshot(): ControlState
  // C6a
  packages/core/src/wow/data/area-names.json
  ```
- Produces:
  ```ts
  // packages/core/src/wow/protocol/world-states.ts
  export type WorldState = { state: number; value: number };
  export type InitWorldStates = { mapId: number; zoneId: number; areaId: number; states: WorldState[] };
  export function parseInitWorldStates(r: PacketReader): InitWorldStates;

  // packages/core/src/wow/client-place.ts
  export type PlaceState = { mapId: number | undefined; zoneId: number | undefined; areaId: number | undefined; zone: string | undefined; area: string | undefined; at: number | undefined };
  export function areaName(id: number): string | undefined;
  export function handleInitWorldStates(conn: WorldConn, r: PacketReader): void;
  export function placeMethods(conn: WorldConn, _rt: Runtimes): Pick<WorldHandle, "getPlaceState">;

  // packages/core/src/wow/world-conn.ts
  place?: PlaceState; // on WorldConn
  ```
  Behaviour: `getPlaceState()` returns a copy of the last parsed place, all fields `undefined` before the first packet. On each packet whose `mapId`, `zoneId` or `areaId` differs from the last one (and on the first packet), `conn.events.control` emits `{ type: "place_changed", state: conn.control.snapshot() }`. The daemon ignores `place_changed` (no ring entry, no session log line), so CLI output does not change except that the "World states is not yet implemented" SYSTEM line goes away.

**Steps:**

- [ ] **Step 1: Write the failing parser test.** Create `packages/core/src/wow/protocol/world-states.test.ts`:

  ```ts
  import { describe, expect, test } from "bun:test";
  import { bytes } from "#test-support/hex";
  import { PacketReader } from "#wow/protocol/packet";
  import { parseInitWorldStates } from "#wow/protocol/world-states";

  const sunstrider = bytes(
    "12 02 00 00 66 0d 00 00 67 0d 00 00 02 00 77 0c 00 00 01 00 00 00 d8 08 00 00 00 00 00 00",
  );
  const goldshire = bytes("00 00 00 00 0c 00 00 00 57 00 00 00 00 00");
  const truncated = bytes("12 02 00 00 66 0d 00 00 67 0d 00 00 01 00 77 0c 00 00");

  describe("parseInitWorldStates", () => {
    test("reads map, zone, area and every state", () => {
      expect(parseInitWorldStates(new PacketReader(sunstrider))).toEqual({
        mapId: 530,
        zoneId: 3430,
        areaId: 3431,
        states: [
          { state: 3191, value: 1 },
          { state: 2264, value: 0 },
        ],
      });
    });

    test("reads a packet with no states", () => {
      expect(parseInitWorldStates(new PacketReader(goldshire))).toEqual({
        mapId: 0,
        zoneId: 12,
        areaId: 87,
        states: [],
      });
    });

    test("throws on a truncated state list", () => {
      expect(() => parseInitWorldStates(new PacketReader(truncated))).toThrow(
        RangeError,
      );
    });
  });
  ```

- [ ] **Step 2: Run it and see it fail.**
  `mise test packages/core/src/wow/protocol/world-states.test.ts`
  Expected: `Cannot find module '#wow/protocol/world-states'`.

- [ ] **Step 3: Implement the parser.** Create `packages/core/src/wow/protocol/world-states.ts` (wire layout: `wow_messages` `smsg_init_world_states.wowm` 3.3.5 block and AzerothCore `WorldStatePackets.cpp:22-38`, both read: `u32 map, u32 zone, u32 area, u16 count, count × {u32 state, u32 value}`):

  ```ts
  import type { PacketReader } from "#wow/protocol/packet";

  export type WorldState = { state: number; value: number };
  export type InitWorldStates = {
    mapId: number;
    zoneId: number;
    areaId: number;
    states: WorldState[];
  };

  export function parseInitWorldStates(r: PacketReader): InitWorldStates {
    const mapId = r.uint32LE();
    const zoneId = r.uint32LE();
    const areaId = r.uint32LE();
    const count = r.uint16LE();
    const states: WorldState[] = [];
    for (let i = 0; i < count; i++)
      states.push({ state: r.uint32LE(), value: r.uint32LE() });
    return { mapId, zoneId, areaId, states };
  }
  ```

  The object literal `{ state: r.uint32LE(), value: r.uint32LE() }` reads in key order. Do not reorder its keys (AGENTS.md "Protocol Gotchas").

- [ ] **Step 4: Run the parser test and see it pass.**
  `mise test packages/core/src/wow/protocol/world-states.test.ts`
  Expected: 3 pass, 0 fail.

- [ ] **Step 5: Write the failing handle test.** Create `packages/core/src/wow/client-place.test.ts`:

  ```ts
  import { describe, expect, test } from "bun:test";
  import { startMockWorldServer } from "#test-support/mock-world-server";
  import {
    base,
    fakeAuth,
    waitForEchoProbe,
  } from "#test-support/world-handlers-fixtures";
  import { type WorldHandle, worldSession } from "#wow/client";
  import { areaName } from "#wow/client-place";
  import type { ControlEvent } from "#wow/control";
  import { GameOpcode } from "#wow/protocol/opcodes";
  import { PacketWriter } from "#wow/protocol/packet";

  type Place = { mapId: number; zoneId: number; areaId: number };

  const sunstrider: Place = { mapId: 530, zoneId: 3430, areaId: 3431 };
  const goldshire: Place = { mapId: 0, zoneId: 12, areaId: 87 };
  const nowhere: Place = { mapId: 1, zoneId: 999_999, areaId: 999_998 };

  function worldStates({ mapId, zoneId, areaId }: Place): Uint8Array {
    const w = new PacketWriter();
    w.uint32LE(mapId);
    w.uint32LE(zoneId);
    w.uint32LE(areaId);
    w.uint16LE(1);
    w.uint32LE(3191);
    w.uint32LE(1);
    return w.finish();
  }

  function nextPlaceChange(handle: WorldHandle): Promise<ControlEvent> {
    const { promise, resolve } = Promise.withResolvers<ControlEvent>();
    const off = handle.onControlEvent((event) => {
      if (event.type !== "place_changed") return;
      off();
      resolve(event);
    });
    return promise;
  }

  function placeChanges(handle: WorldHandle): ControlEvent[] {
    const seen: ControlEvent[] = [];
    handle.onControlEvent((event) => {
      if (event.type === "place_changed") seen.push(event);
    });
    return seen;
  }

  async function session() {
    const server = await startMockWorldServer({ coalesceSelfCreate: true });
    const handle = await worldSession(
      { ...base, host: "127.0.0.1", port: server.port },
      fakeAuth(server.port),
    );
    await waitForEchoProbe(handle);
    return { handle, server };
  }

  describe("place state", () => {
    test("is empty before the first world states packet", async () => {
      const { server, handle } = await session();
      try {
        expect(handle.getPlaceState()).toEqual({
          mapId: undefined,
          zoneId: undefined,
          areaId: undefined,
          zone: undefined,
          area: undefined,
          at: undefined,
        });
      } finally {
        handle.close();
        await handle.closed;
        server.stop();
      }
    });

    test("names the zone and area from the packet", async () => {
      const { server, handle } = await session();
      try {
        const changed = nextPlaceChange(handle);
        server.inject(GameOpcode.SMSG_INIT_WORLD_STATES, worldStates(sunstrider));
        const event = await changed;
        expect(event.state.selfGuid).toBe(handle.getControlState().selfGuid);
        expect(handle.getPlaceState()).toMatchObject({
          mapId: 530,
          zoneId: 3430,
          areaId: 3431,
          zone: "Eversong Woods",
          area: "Sunstrider Isle",
        });
        expect(handle.getPlaceState().at).toBeNumber();
      } finally {
        handle.close();
        await handle.closed;
        server.stop();
      }
    });

    test("emits place_changed only when the place differs", async () => {
      const { server, handle } = await session();
      try {
        const seen = placeChanges(handle);
        const first = nextPlaceChange(handle);
        server.inject(GameOpcode.SMSG_INIT_WORLD_STATES, worldStates(sunstrider));
        await first;
        const second = nextPlaceChange(handle);
        server.inject(GameOpcode.SMSG_INIT_WORLD_STATES, worldStates(sunstrider));
        server.inject(GameOpcode.SMSG_INIT_WORLD_STATES, worldStates(goldshire));
        await second;
        expect(seen).toHaveLength(2);
        expect(handle.getPlaceState()).toMatchObject({
          zone: "Elwynn Forest",
          area: "Goldshire",
        });
      } finally {
        handle.close();
        await handle.closed;
        server.stop();
      }
    });

    test("leaves unknown ids without a name", async () => {
      const { server, handle } = await session();
      try {
        const changed = nextPlaceChange(handle);
        server.inject(GameOpcode.SMSG_INIT_WORLD_STATES, worldStates(nowhere));
        await changed;
        expect(handle.getPlaceState()).toMatchObject({
          zoneId: 999_999,
          areaId: 999_998,
          zone: undefined,
          area: undefined,
        });
      } finally {
        handle.close();
        await handle.closed;
        server.stop();
      }
    });

    test("returns a copy, not the stored state", async () => {
      const { server, handle } = await session();
      try {
        const changed = nextPlaceChange(handle);
        server.inject(GameOpcode.SMSG_INIT_WORLD_STATES, worldStates(goldshire));
        await changed;
        const place = handle.getPlaceState();
        place.zone = "changed";
        expect(handle.getPlaceState().zone).toBe("Elwynn Forest");
      } finally {
        handle.close();
        await handle.closed;
        server.stop();
      }
    });
  });

  describe("areaName", () => {
    test("reads the generated table", () => {
      expect(areaName(3430)).toBe("Eversong Woods");
      expect(areaName(3433)).toBe("Ghostlands");
      expect(areaName(12)).toBe("Elwynn Forest");
      expect(areaName(0)).toBeUndefined();
    });
  });
  ```

- [ ] **Step 6: Run it and see it fail.**
  `mise test packages/core/src/wow/client-place.test.ts`
  Expected: the file fails to load with `SyntaxError: Export named 'areaName' not found in module '.../client-place.ts'` (the C0 stub exports only `PlaceState` and `placeMethods`).

- [ ] **Step 7: Implement the place body.** Replace the whole of `packages/core/src/wow/client-place.ts` with:

  ```ts
  import type { WorldHandle } from "#wow/client";
  import type { PacketReader } from "#wow/protocol/packet";
  import {
    type InitWorldStates,
    parseInitWorldStates,
  } from "#wow/protocol/world-states";
  import type { Runtimes } from "#wow/runtime";
  import type { WorldConn } from "#wow/world-conn";
  import areaNames from "./data/area-names.json" with { type: "json" };

  export type PlaceState = {
    mapId: number | undefined;
    zoneId: number | undefined;
    areaId: number | undefined;
    zone: string | undefined;
    area: string | undefined;
    at: number | undefined;
  };

  type PlaceMethods = Pick<WorldHandle, "getPlaceState">;

  const names: Readonly<Record<string, string>> = areaNames;

  const EMPTY: PlaceState = {
    mapId: undefined,
    zoneId: undefined,
    areaId: undefined,
    zone: undefined,
    area: undefined,
    at: undefined,
  };

  export function areaName(id: number): string | undefined {
    return names[String(id)];
  }

  function placeOf(parsed: InitWorldStates, at: number): PlaceState {
    const { mapId, zoneId, areaId } = parsed;
    const zone = areaName(zoneId);
    const area = areaName(areaId);
    return { mapId, zoneId, areaId, zone, area, at };
  }

  function samePlace(last: PlaceState | undefined, next: PlaceState): boolean {
    if (!last) return false;
    const sameMap = last.mapId === next.mapId;
    return sameMap && last.zoneId === next.zoneId && last.areaId === next.areaId;
  }

  export function handleInitWorldStates(conn: WorldConn, r: PacketReader): void {
    const place = placeOf(parseInitWorldStates(r), Date.now());
    const changed = !samePlace(conn.place, place);
    conn.place = place;
    const { control } = conn;
    if (!changed || !control) return;
    conn.events.control.emit({ type: "place_changed", state: control.snapshot() });
  }

  export function placeMethods(conn: WorldConn, _rt: Runtimes): PlaceMethods {
    return {
      getPlaceState() {
        return { ...(conn.place ?? EMPTY) };
      },
    };
  }
  ```

  `PlaceMethods` is the contract's `Pick<WorldHandle, "getPlaceState">` under a local name, so the signature fits one line.

- [ ] **Step 8: Add the connection field.** In `packages/core/src/wow/world-conn.ts`, add `import type { PlaceState } from "#wow/client-place";` to the imports (biome sorts them) and add this last field to `WorldConn`, after `tactics?: TacticsLoop;`:

  ```ts
    place?: PlaceState;
  ```

- [ ] **Step 9: Register the handler.** In `packages/core/src/wow/client-handlers.ts`, add `import { handleInitWorldStates } from "#wow/client-place";` and add this line at the end of `registerObjectHandlers`, after the `SMSG_GUILD_INVITE` line:

  ```ts
    on(GameOpcode.SMSG_INIT_WORLD_STATES, (r) => handleInitWorldStates(conn, r));
  ```

- [ ] **Step 10: Run the handle test and see it pass.**
  `mise test packages/core/src/wow/client-place.test.ts`
  Expected: 6 pass, 0 fail.

- [ ] **Step 11: Write the failing stub test.** In `packages/core/src/wow/protocol/stubs.test.ts`, add inside `describe("registerStubs", …)`:

  ```ts
    test("leaves world states to the place handler", () => {
      expect(STUBS.map(([opcode]) => opcode)).not.toContain(
        GameOpcode.SMSG_INIT_WORLD_STATES,
      );
    });
  ```

  Run `mise test packages/core/src/wow/protocol/stubs.test.ts`. Expected: this test fails with `expect(received).not.toContain(expected)` (706 is in the list).

- [ ] **Step 12: Remove the stub row.** In `packages/core/src/wow/protocol/stubs.ts`, delete the line:

  ```ts
    [GameOpcode.SMSG_INIT_WORLD_STATES, "World states"],
  ```

  Run `mise test packages/core/src/wow/protocol/stubs.test.ts`. Expected: all pass.

- [ ] **Step 13: Write the failing daemon test.** In `packages/cli/src/daemon/events-control.test.ts`, add inside `describe("onControlEvent", …)`:

  ```ts
    test("ignores place_changed, which carries no place data", () => {
      const events = new RingBuffer<EventEntry>(10);
      const append = jest.fn(() => Promise.resolve());
      const log = { append } as unknown as SessionLog;
      onControlEvent({ state: sampleState(), type: "place_changed" }, events, log);
      expect(events.drain()).toEqual([]);
      expect(append).not.toHaveBeenCalled();
    });
  ```

  Run `mise test packages/cli/src/daemon/events-control.test.ts`. Expected: this test fails, `expect(received).toEqual(expected)` with one drained entry.

- [ ] **Step 14: Make the daemon ignore it.** In `packages/cli/src/daemon/events.ts`, make the first line of `onControlEvent`:

  ```ts
    if (event.type === "place_changed") return;
  ```

  Run `mise test packages/cli/src/daemon/events-control.test.ts`. Expected: all pass.

- [ ] **Step 15: Check the four doc places.** `rg -n "World states|not yet implemented" packages/cli/src/cli/help.ts docs/manual.md .claude/skills/tuicraft/SKILL.md README.md` finds nothing (measured while planning), and no CLI verb or JSON field changes. So no doc edit (contract 1.1).

- [ ] **Step 16: Full gate.**
  `bun run tsc --noEmit -p packages/core` and `bun run tsc --noEmit -p packages/cli` exit 0. `mise lint:fix` (organizes the new imports), then `mise ci` passes.

- [ ] **Step 17: Live gate (AGENTS.md "Testing").** Use two throwaway accounts, never another character.
  1. `bun packages/factory/src/main.ts soap create fresh --gm 2` → save the JSON as A (GM level 2 for `.go`, `.freeze`, `.tele`).
  2. `bun packages/factory/src/main.ts soap create eversong10` → save the JSON as B.
  3. Legacy suite: `XDG_CONFIG_HOME=<A.dir>/config WOW_ACCOUNT_1=<A.account> WOW_PASSWORD_1=<A.password> WOW_CHARACTER_1=<A.character> WOW_ACCOUNT_2=<B.account> WOW_PASSWORD_2=<B.password> WOW_CHARACTER_2=<B.character> mise test:live`. Expected: all pass.
  4. Place probe. Write `tmp/place-probe.ts` (scratch, not committed; it imports core by relative path because `tmp/` has no workspace link):

     ```ts
     import { authHandshake, worldSession } from "../packages/core/src/wow/session.ts";

     const [account = "", password = "", character = ""] = Bun.argv.slice(2);
     const config = { account, character, host: "t1", language: 1, password, port: 3724 };
     const handle = await worldSession(config, await authHandshake(config));
     const moved = Promise.withResolvers<void>();
     handle.onControlEvent((event) => {
       if (event.type !== "place_changed") return;
       const place = handle.getPlaceState();
       console.log("place_changed", JSON.stringify(place));
       if (place.zone === "Ghostlands") moved.resolve();
     });
     await Bun.sleep(3000);
     console.log("login", JSON.stringify(handle.getPlaceState()));
     handle.sendWhisper(character, ".go xyz 7575 -6835 89.1 530");
     await Promise.race([moved.promise, Bun.sleep(15_000)]);
     handle.sendWhisper(character, ".go xyz 10349.6 -6357.29 33.4 530");
     await Bun.sleep(3000);
     handle.close();
     await handle.closed;
     ```

     Run `bun tmp/place-probe.ts <A.account> <A.password> <A.character>`.
     Expected (not yet measured): the `login` line has `"mapId":530,"zoneId":3430,"zone":"Eversong Woods"` and a defined `area` (the fresh preset stands on Sunstrider Isle, so probably `"areaId":3431,"area":"Sunstrider Isle"`, but a smaller sub-area is possible). Then a `place_changed` line with `"zoneId":3433,"zone":"Ghostlands"`, then one back to Eversong Woods. If no Ghostlands line appears in 15 s, the gate fails: stop and report with the probe output.
  5. `bun packages/factory/src/main.ts soap delete <A.account>` and `bun packages/factory/src/main.ts soap delete <B.account>`. Delete `tmp/place-probe.ts`.
  6. Put the probe's `login` and `Ghostlands` lines in the commit body as live evidence. If the server or SOAP is down, stop and report to the coordinator (AGENTS.md: infrastructure failures go to the user).

- [ ] **Step 18: Commit.**
  ```bash
  git add packages/core/src/wow/protocol/world-states.ts packages/core/src/wow/protocol/world-states.test.ts packages/core/src/wow/client-place.ts packages/core/src/wow/client-place.test.ts packages/core/src/wow/world-conn.ts packages/core/src/wow/client-handlers.ts packages/core/src/wow/protocol/stubs.ts packages/core/src/wow/protocol/stubs.test.ts packages/cli/src/daemon/events.ts packages/cli/src/daemon/events-control.test.ts
  ```
  ```bash
  mise exec -- git commit -m "feat: Track place from world states" -m "The harness names the zone and area in look, the now line and the footer. SMSG_INIT_WORLD_STATES carries map, zone and area at login and on zone entry; the daemon ignores place_changed, so CLI output only loses the not-implemented line. Live: <login line>; <Ghostlands line>."
  ```

---

## Task C7a: lootCorpse handle run

**Design:** G7. **Needs:** C1. **Live gate:** not required (no protocol or daemon change; contract issue 9). `mise ci` is the gate.

**Files:**
- Modify: `packages/core/src/wow/client-runs.ts` (the C0 stub is replaced in full; `recoverCorpse` still throws `not_implemented`)
- Test: `packages/core/src/wow/client-runs.test.ts` (create)

**Interfaces:**
- Consumes:
  ```ts
  // packages/core/src/wow/loot-run.ts (read)
  export type LootRun = Pick<CycleDeps, "rewards" | "bags"> & { events: EventWaiter<RewardsEvent>; bodies: EventWaiter<EntityEvent>; signal: AbortSignal };
  export async function lootCorpse(run: LootRun, guid: bigint): Promise<Looted>;
  // packages/core/src/wow/cycle-stop.ts
  export function cycleStop(cause: string, detail?: Record<string, unknown>): CycleStop;
  // packages/core/src/wow/event-waiter.ts
  export class EventWaiter<E> { push(event: E): void }
  // packages/core/src/wow/world-events.ts
  export type WorldEvents = { rewards: Emitter<[RewardsEvent]>; entity: Emitter<[EntityEvent]>; recovery: Emitter<[RecoveryEvent]>; control: Emitter<[ControlEvent]>; ... };
  // packages/core/src/wow/runtime.ts
  Runtimes: { control; recovery; quests; rewards; items; cycle; ... }
  // test support (read): fakeLoot, fakeControl, body (encounter-cycle-fixtures.ts), fakeRecovery (cycle-recovery-fixtures.ts)
  ```
- Produces:
  ```ts
  export type LootOutcome = { ok: true; record: CycleLootRecord | undefined } | CycleStop;
  export type RecoveryOutcome = ({ ok: true } & CycleRecovery) | CycleStop;
  export type RunDeps = Pick<CycleDeps, "rewards" | "bags" | "recovery" | "control"> & {
    events: Pick<WorldEvents, "rewards" | "entity" | "recovery" | "control">;
    cycleActive: () => boolean;
  };
  export function createRuns(deps: RunDeps): Pick<WorldHandle, "lootCorpse" | "recoverCorpse">;
  export function runMethods(conn: WorldConn, rt: Runtimes): Pick<WorldHandle, "lootCorpse" | "recoverCorpse">;
  ```
  Behaviour: `lootCorpse(guid, signal)` returns the `loot-run.ts` result unchanged. It returns `cycleStop("busy")` while `rt.cycle` is active or another handle run is active, and `cycleStop("cancelled")` when the signal is aborted (before or during the run). It unsubscribes its listeners before it returns.

**Steps:**

- [ ] **Step 1: Write the failing test.** Create `packages/core/src/wow/client-runs.test.ts`:

  ```ts
  import { describe, expect, test } from "bun:test";
  import { fakeRecovery } from "#test-support/cycle-recovery-fixtures";
  import {
    body,
    fakeControl,
    fakeLoot,
  } from "#test-support/encounter-cycle-fixtures";
  import { createRuns } from "#wow/client-runs";
  import { createWorldEvents } from "#wow/world-events";

  type Fakes = {
    loot?: ReturnType<typeof fakeLoot>;
    recovery?: ReturnType<typeof fakeRecovery>;
    control?: ReturnType<typeof fakeControl>;
    cycleActive?: () => boolean;
  };

  const idle = new AbortController().signal;

  function wire(fakes: Fakes) {
    const loot = fakes.loot ?? fakeLoot({});
    const recovery = fakes.recovery ?? fakeRecovery({ life: ["alive"] });
    const control = fakes.control ?? fakeControl();
    const cycleActive = fakes.cycleActive ?? (() => false);
    const events = createWorldEvents();
    loot.onEvent((event) => events.rewards.emit(event));
    recovery.onEvent((event) => events.recovery.emit(event));
    control.onEvent((event) => events.control.emit(event));
    const bags = {
      questItems: () => new Set<number>(),
      stackSize: async () => undefined,
    };
    const deps = { bags, control, cycleActive, events, recovery, rewards: loot };
    return { events, runs: createRuns(deps) };
  }

  describe("lootCorpse", () => {
    test("takes every slot and the money and returns the record", async () => {
      const loot = fakeLoot({
        items: [4, 7],
        money: 9,
        coinageBefore: 10,
        coinageAfter: 19,
      });
      const { runs } = wire({ loot });
      expect(await runs.lootCorpse(2n, idle)).toEqual({
        ok: true,
        record: {
          guid: "2",
          slotsTaken: [4, 7],
          slotsLeft: [],
          moneyTaken: 9,
          coinageBefore: 10,
          coinageAfter: 19,
        },
      });
    });

    test("returns no record for a corpse with nothing to loot", async () => {
      const loot = fakeLoot({ corpse: { dead: true, lootable: false } });
      const { runs } = wire({ loot });
      expect(await runs.lootCorpse(2n, idle)).toEqual({
        ok: true,
        record: undefined,
      });
    });

    test("a finished run frees the next one", async () => {
      const loot = fakeLoot({ corpse: { dead: true, lootable: false } });
      const { runs } = wire({ loot });
      await runs.lootCorpse(2n, idle);
      expect(await runs.lootCorpse(2n, idle)).toMatchObject({ ok: true });
    });

    test("waits for the death update of its own target only", async () => {
      const loot = fakeLoot({ items: [4], corpse: { dead: false, lootable: true } });
      const { events, runs } = wire({ loot });
      const looted = runs.lootCorpse(2n, idle);
      await loot.attempted;
      events.entity.emit(body(9n, 0));
      await Bun.sleep(1);
      loot.corpse.dead = true;
      events.entity.emit(body(2n, 0));
      expect(await looted).toMatchObject({
        ok: true,
        record: { slotsTaken: [4] },
      });
    });

    test("unsubscribes from the world events when it returns", async () => {
      const { events, runs } = wire({ loot: fakeLoot({ items: [4] }) });
      await runs.lootCorpse(2n, idle);
      expect(events.rewards.size).toBe(0);
      expect(events.entity.size).toBe(0);
    });

    test("refuses while the encounter cycle runs", async () => {
      const loot = fakeLoot({ items: [4] });
      const { runs } = wire({ loot, cycleActive: () => true });
      expect(await runs.lootCorpse(2n, idle)).toMatchObject({
        ok: false,
        cause: "busy",
      });
      expect(loot.taken()).toEqual([]);
    });

    test("refuses a second run while one is open", async () => {
      const loot = fakeLoot({ items: [], deferClose: true });
      const { runs } = wire({ loot });
      const first = runs.lootCorpse(2n, idle);
      await loot.closing;
      expect(await runs.lootCorpse(3n, idle)).toMatchObject({
        ok: false,
        cause: "busy",
      });
      loot.acknowledgeClose();
      expect(await first).toMatchObject({ ok: true });
    });

    test("returns cancelled for an aborted signal", async () => {
      const { runs } = wire({ loot: fakeLoot({ items: [4] }) });
      const controller = new AbortController();
      controller.abort();
      expect(await runs.lootCorpse(2n, controller.signal)).toMatchObject({
        ok: false,
        cause: "cancelled",
      });
    });

    test("returns cancelled when the signal aborts during the run", async () => {
      const loot = fakeLoot({ items: [4] });
      const { runs } = wire({ loot });
      const controller = new AbortController();
      const looted = runs.lootCorpse(2n, controller.signal);
      controller.abort();
      expect(await looted).toMatchObject({ ok: false, cause: "cancelled" });
      expect(loot.taken()).toEqual([]);
    });
  });
  ```

  Why `await Bun.sleep(1)` in the death test: it lets `awaitCorpse` resume if the guid filter were missing. Without the filter, the run would then retry `open` while `corpse.dead` is still false and stop with `loot_denied:…`, so the test fails.

- [ ] **Step 2: Run it and see it fail.**
  `mise test packages/core/src/wow/client-runs.test.ts`
  Expected: the file fails to load with `SyntaxError: Export named 'createRuns' not found in module '.../client-runs.ts'`.

- [ ] **Step 3: Implement.** Replace the whole of `packages/core/src/wow/client-runs.ts` with:

  ```ts
  import type { WorldHandle } from "#wow/client";
  import type { CycleRecovery } from "#wow/corpse-run";
  import { type CycleStop, cycleStop } from "#wow/cycle-stop";
  import type { CycleDeps, CycleLootRecord } from "#wow/encounter-cycle";
  import type { EntityEvent } from "#wow/entity-store";
  import { EventWaiter } from "#wow/event-waiter";
  import { lootCorpse } from "#wow/loot-run";
  import type { RewardsEvent } from "#wow/rewards";
  import type { Runtimes } from "#wow/runtime";
  import type { WorldConn } from "#wow/world-conn";
  import type { WorldEvents } from "#wow/world-events";

  export type LootOutcome =
    | { ok: true; record: CycleLootRecord | undefined }
    | CycleStop;
  export type RecoveryOutcome = ({ ok: true } & CycleRecovery) | CycleStop;

  export type RunDeps = Pick<
    CycleDeps,
    "rewards" | "bags" | "recovery" | "control"
  > & {
    events: Pick<WorldEvents, "rewards" | "entity" | "recovery" | "control">;
    cycleActive: () => boolean;
  };

  type Runs = Pick<WorldHandle, "lootCorpse" | "recoverCorpse">;
  type LootCall = { deps: RunDeps; guid: bigint; signal: AbortSignal };

  export function createRuns(deps: RunDeps): Runs {
    let running = false;
    async function exclusive<T>(signal: AbortSignal, work: () => Promise<T>) {
      if (running || deps.cycleActive()) return cycleStop("busy");
      if (signal.aborted) return cycleStop("cancelled");
      running = true;
      try {
        return await work();
      } catch (error) {
        if (signal.aborted) return cycleStop("cancelled");
        throw error;
      } finally {
        running = false;
      }
    }
    return {
      lootCorpse(guid, signal) {
        return exclusive(signal, () => lootRun({ deps, guid, signal }));
      },
      async recoverCorpse() {
        throw new Error("not_implemented");
      },
    };
  }

  async function lootRun({ deps, guid, signal }: LootCall): Promise<LootOutcome> {
    const events = new EventWaiter<RewardsEvent>();
    const bodies = new EventWaiter<EntityEvent>();
    const detach = [
      deps.events.rewards.subscribe((event) => events.push(event)),
      deps.events.entity.subscribe((event) => {
        if (entityGuid(event) === guid) bodies.push(event);
      }),
    ];
    try {
      const { rewards, bags } = deps;
      return await lootCorpse({ rewards, bags, events, bodies, signal }, guid);
    } finally {
      for (const off of detach) off();
    }
  }

  function entityGuid(event: EntityEvent): bigint {
    return event.type === "disappear" ? event.guid : event.entity.guid;
  }

  function bagsOf({ quests, items }: Runtimes): CycleDeps["bags"] {
    return {
      questItems: () =>
        new Set(quests.snapshot().items.map((item) => item.itemId)),
      stackSize: (entry) =>
        items.lookup(entry).then(
          (template) => template?.stackSize,
          () => undefined,
        ),
    };
  }

  export function runMethods(conn: WorldConn, rt: Runtimes): Runs {
    const { control, cycle, recovery, rewards } = rt;
    const cycleActive = () => cycle.snapshot().active;
    const bags = bagsOf(rt);
    const { events } = conn;
    return createRuns({ bags, control, cycleActive, events, recovery, rewards });
  }
  ```

  Notes for the reviewer: `bagsOf` copies `runtime.ts:321-329` because C7 must not edit `runtime.ts` (contract 1.4). `entityGuid` is the same filter as `EncounterCycleRuntime.observeEntity` (`encounter-cycle.ts:153-156`). `Runs` is the contract's return type under a local name.

- [ ] **Step 4: Run the test and see it pass.**
  `mise test packages/core/src/wow/client-runs.test.ts`
  Expected: 9 pass, 0 fail.

- [ ] **Step 5: Full gate.**
  `bun run tsc --noEmit -p packages/core` exits 0 (this also checks that `runMethods` still fits the `createHandle` spread from C0). `mise lint:fix`, then `mise ci` passes.

- [ ] **Step 6: Commit.**
  ```bash
  git add packages/core/src/wow/client-runs.ts packages/core/src/wow/client-runs.test.ts
  ```
  ```bash
  mise exec -- git commit -m "feat: Add a lootCorpse handle run" -m "The harness loot and engage tools need the cycle's tested loot sequence without starting a cycle. The run feeds loot-run.ts from the world events and refuses with busy while the cycle or another run is active."
  ```

---

## Task C7b: recoverCorpse handle run

**Design:** G7. **Needs:** C7a. **Live gate:** not required (contract issue 9); a scripted live probe is in Step 6.

**Files:**
- Modify: `packages/core/src/wow/client-runs.ts` (the `recoverCorpse` method and its run)
- Test: `packages/core/src/wow/client-runs.test.ts` (a second `describe`)

**Interfaces:**
- Consumes:
  ```ts
  // packages/core/src/wow/corpse-run.ts (read)
  export type CorpseRun = Pick<CycleDeps, "recovery" | "control"> & { events: EventWaiter<RecoveryEvent>; motion: EventWaiter<ControlEvent>; signal: AbortSignal };
  export async function recoverCorpse(run: CorpseRun): Promise<Recovered>;
  // C7a: createRuns, RunDeps, RecoveryOutcome, the exclusive guard
  // test support (read): fakeRecovery, fakeControl, fakeLoot, advanceUntilSettled
  ```
- Produces:
  ```ts
  recoverCorpse: (signal: AbortSignal) => Promise<RecoveryOutcome>; // on createRuns(...) and runMethods(...)
  ```
  Behaviour: returns the `corpse-run.ts` result unchanged (accept a pending resurrection, or release, find the corpse, walk legs, wait out the reclaim delay, reclaim). Same `busy` and `cancelled` rules as `lootCorpse`, with one shared guard, so a loot run blocks a recovery run and the reverse.

**Steps:**

- [ ] **Step 1: Write the failing tests.** In `packages/core/src/wow/client-runs.test.ts`, change the first import to `import { describe, expect, jest, test } from "bun:test";`, add `advanceUntilSettled` to the `#test-support/encounter-cycle-fixtures` import, add `import type { ControlPose } from "#wow/control";`, and append:

  ```ts
  const origin: ControlPose = {
    mapId: 0,
    x: 0,
    y: 0,
    z: 0,
    orientation: 0,
    source: "predicted",
    updatedAt: 0,
  };

  function corpseAt(x: number) {
    return {
      status: "found" as const,
      mapId: 0,
      corpseMapId: 0,
      position: { x, y: 0, z: 0 },
    };
  }

  describe("recoverCorpse", () => {
    test("releases, finds a corpse in range and reclaims it", async () => {
      const control = fakeControl({ pose: origin });
      const recovery = fakeRecovery({
        life: ["dead", "ghost", "alive"],
        corpse: corpseAt(5),
        pose: () => control.pose(),
      });
      const { runs } = wire({ control, recovery });
      expect(await runs.recoverCorpse(idle)).toMatchObject({
        ok: true,
        outcome: "reclaimed",
        detail: { range: 5, legs: 0 },
      });
      expect(control.moves()).toEqual([]);
    });

    test("walks legs on control stop events to a far corpse", async () => {
      jest.useFakeTimers();
      try {
        const control = fakeControl({ pose: origin });
        const recovery = fakeRecovery({
          life: ["ghost", "alive"],
          corpse: corpseAt(70),
          pose: () => control.pose(),
        });
        const { runs } = wire({ control, recovery });
        const recovered = runs.recoverCorpse(idle);
        await advanceUntilSettled(recovered, 10_000);
        expect(await recovered).toMatchObject({
          ok: true,
          outcome: "reclaimed",
          detail: { legs: 2 },
        });
        expect(control.moves()).toHaveLength(2);
      } finally {
        jest.useRealTimers();
      }
    });

    test("accepts a pending resurrection", async () => {
      const recovery = fakeRecovery({ offer: true, life: ["dead", "alive"] });
      const { runs } = wire({ recovery });
      expect(await runs.recoverCorpse(idle)).toMatchObject({
        ok: true,
        outcome: "resurrected",
      });
      expect(recovery.answered()).toBe(true);
    });

    test("stops with life_unknown for a live character", async () => {
      const { runs } = wire({ recovery: fakeRecovery({ life: ["alive"] }) });
      expect(await runs.recoverCorpse(idle)).toMatchObject({
        ok: false,
        cause: "life_unknown",
      });
    });

    test("refuses while the encounter cycle runs", async () => {
      const recovery = fakeRecovery({ offer: true, life: ["dead", "alive"] });
      const { runs } = wire({ recovery, cycleActive: () => true });
      expect(await runs.recoverCorpse(idle)).toMatchObject({
        ok: false,
        cause: "busy",
      });
      expect(recovery.answered()).toBe(false);
    });

    test("shares one guard with lootCorpse", async () => {
      const loot = fakeLoot({ items: [], deferClose: true });
      const recovery = fakeRecovery({ offer: true, life: ["dead", "alive"] });
      const { runs } = wire({ loot, recovery });
      const looted = runs.lootCorpse(2n, idle);
      await loot.closing;
      expect(await runs.recoverCorpse(idle)).toMatchObject({
        ok: false,
        cause: "busy",
      });
      loot.acknowledgeClose();
      await looted;
      expect(recovery.answered()).toBe(false);
    });

    test("returns cancelled when the signal aborts during the run", async () => {
      const control = fakeControl({ pose: origin });
      const recovery = fakeRecovery({
        life: ["ghost", "alive"],
        corpse: corpseAt(70),
        pose: () => control.pose(),
      });
      const { runs } = wire({ control, recovery });
      const controller = new AbortController();
      const recovered = runs.recoverCorpse(controller.signal);
      controller.abort();
      expect(await recovered).toMatchObject({ ok: false, cause: "cancelled" });
      expect(control.moves()).toEqual([]);
    });

    test("unsubscribes from the world events when it returns", async () => {
      const recovery = fakeRecovery({ offer: true, life: ["dead", "alive"] });
      const { events, runs } = wire({ recovery });
      await runs.recoverCorpse(idle);
      expect(events.recovery.size).toBe(0);
      expect(events.control.size).toBe(0);
    });
  });
  ```

  Why the walk test gives 2 legs (worked through `corpse-legs.ts`, read): speed 7, corpse 70 yd away; leg 1 lasts 3000 ms and ends 49 yd away; leg 2 lasts round((49 − 30) / 7 × 1000) = 2714 ms and ends about 30 yd away, which is inside the fake's 39 yd reclaim range.

- [ ] **Step 2: Run them and see them fail.**
  `mise test packages/core/src/wow/client-runs.test.ts`
  Expected: the 9 `lootCorpse` tests pass. The `recoverCorpse` tests fail with `error: not_implemented`, except "refuses while the encounter cycle runs" and "shares one guard", which also fail because the stub throws before the guard.

- [ ] **Step 3: Implement.** In `packages/core/src/wow/client-runs.ts`:
  1. Change the corpse-run import to `import { type CycleRecovery, recoverCorpse } from "#wow/corpse-run";` and add `import type { ControlEvent } from "#wow/control";` and `import type { RecoveryEvent } from "#wow/recovery";`.
  2. Add the call type under `LootCall`:

     ```ts
     type RecoveryCall = { deps: RunDeps; signal: AbortSignal };
     ```

  3. Replace the `recoverCorpse` stub in `createRuns` with:

     ```ts
         recoverCorpse(signal) {
           return exclusive(signal, () => recoveryRun({ deps, signal }));
         },
     ```

  4. Add this function after `lootRun`:

     ```ts
     async function recoveryRun({ deps, signal }: RecoveryCall): Promise<RecoveryOutcome> {
       const events = new EventWaiter<RecoveryEvent>();
       const motion = new EventWaiter<ControlEvent>();
       const detach = [
         deps.events.recovery.subscribe((event) => events.push(event)),
         deps.events.control.subscribe((event) => motion.push(event)),
       ];
       try {
         const { recovery, control } = deps;
         return await recoverCorpse({ recovery, control, events, motion, signal });
       } finally {
         for (const off of detach) off();
       }
     }
     ```

     If the formatter wraps the `recoveryRun` signature, keep it: the argument list is one object, which the style rule allows.

- [ ] **Step 4: Run the tests and see them pass.**
  `mise test packages/core/src/wow/client-runs.test.ts`
  Expected: 17 pass, 0 fail.

- [ ] **Step 5: Full gate.**
  `bun run tsc --noEmit -p packages/core` exits 0. `mise lint:fix`, then `mise ci` passes. Check the file size: `rg -c -v '^\s*$' packages/core/src/wow/client-runs.ts` is under 500 (expected about 110).

- [ ] **Step 6: Scripted live probe (recommended, hedged).** C7 changes no protocol, so this does not block the commit. It gives early live evidence before B6 and B11. If the probe needs debugging beyond one rerun, stop and hand it to one omp worker (AGENTS.md: delegate live gameplay debugging).
  1. `bun packages/factory/src/main.ts soap create fresh --gm 2` → save the JSON as A.
  2. Write `tmp/runs-probe.ts` (scratch, not committed):

     ```ts
     import { authHandshake, worldSession } from "../packages/core/src/wow/session.ts";

     const [account = "", password = "", character = ""] = Bun.argv.slice(2);
     const config = { account, character, host: "t1", language: 1, password, port: 3724 };
     const handle = await worldSession(config, await authHandshake(config));
     const json = (value: unknown) =>
       JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? String(v) : v));
     const gm = (command: string) => handle.sendWhisper(character, command);
     await Bun.sleep(3000);
     const mob = handle
       .queryNearby()
       .find((row) => !row.self && row.entity.objectType === 3 && "health" in row.entity && row.entity.health > 0);
     if (mob) {
       handle.selectTarget(mob.entity.guid);
       gm(".die");
       await Bun.sleep(2000);
       console.log("loot", json(await handle.lootCorpse(mob.entity.guid, AbortSignal.timeout(30_000))));
     }
     handle.selectTarget(handle.getControlState().selfGuid);
     gm(".die");
     await Bun.sleep(3000);
     console.log("life", handle.getRecoveryState().life);
     console.log("recover", json(await handle.recoverCorpse(AbortSignal.timeout(120_000))));
     handle.close();
     await handle.closed;
     ```

  3. Run `bun tmp/runs-probe.ts <A.account> <A.password> <A.character>`.
     Expected (not yet measured): `loot {"ok":true,…}` with a record or `record` absent, `life dead`, and `recover {"ok":true,"outcome":"reclaimed",…}`. Unverified: that GM level 2 may use `.die` (AzerothCore `HandleDieCommand`, `cs_misc.cpp:1194`, needs a selected unit; its RBAC level was not checked) and that a `.die` kill gives the GM loot rights. A refusal (a SYSTEM line, `life alive`) is a probe limit, not a C7 defect: record it and leave the live proof to B6, B11 and FINAL. A stop such as `corpse_unreachable` is a real result: put it in the commit body and tell the coordinator.
  4. `bun packages/factory/src/main.ts soap delete <A.account>`. Delete `tmp/runs-probe.ts`.

- [ ] **Step 7: Commit.**
  ```bash
  git add packages/core/src/wow/client-runs.ts packages/core/src/wow/client-runs.test.ts
  ```
  ```bash
  mise exec -- git commit -m "feat: Add a recoverCorpse handle run" -m "The harness recover and travel tools need the cycle's tested corpse run without starting a cycle. It shares the lootCorpse guard, so only one handle run moves the character at a time. Live probe: <result or 'not run: reason'>."
  ```
