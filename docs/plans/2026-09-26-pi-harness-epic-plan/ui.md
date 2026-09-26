# Pi harness epic, area "ui": task plan (key: ui)

Plan index: [2026-09-26-pi-harness-epic-plan.md](../2026-09-26-pi-harness-epic-plan.md).

Written 2026-09-26 against [`contract.md`](contract.md) (the contract wins where this
file and the contract disagree). Worktree: `/home/deity/orca/workspaces/tuicraft/pi-epic` (builders use an Orca child worktree of it; every `cd` below goes to that child worktree root),
branch `epic/pi-harness`. Every code block below was type-checked with
`tsc --noEmit`, linted with the repository `biome.json` (formatter and assist
actions on) and run with `bun test` in a scratch copy of `packages/harness`
that held the seven frozen `contract/*.ts` files and stand-ins for the
other areas (measured 2026-09-26: `bun test` ran 98 tests across 15 files, 98 pass, 0 fail;
`biome check --error-on-warnings` on the 32 area files: no errors; `tsc`: exit 0).

## Area overview

1. U1a–U1c make the base: `ui/glyphs.ts` (83 names × 3 sets), the glyph context, the shared drawing helpers in `ui/draw.ts`, and two test-support files (a test theme with snapshot fixtures, and a Pi recorder).
2. U2 (4-row unit-frame footer), U3 (6-row ticker), U4 (event cards and human-only lines) and U9 (tab title and working message) are pure functions of contract types, with width sweeps from 30 to 220 columns.
3. U5 builds the renderer registry and the line family (`social`, `stop`) plus the helpers that every family uses; U6 (picture: `look`), U7 (live run: `travel`, `engage`, `rest`, `recover`) and U8 (card: `interact`, `loot`, `journal`) each add one family and their registry entries.
4. U10 registers the eleven human slash commands; U11a mounts the footer, ticker, renderers, title and working message in each TUI session with a 10 Hz repaint cap and a 1 s tick.
5. U11b is the Orca pane smoke on a throwaway soap account after BOOT; it also decides the V5 footer fallback (a one-line flip in `ui/install.ts`).

## Contract issues

These are defects or gaps that this plan found in [`contract.md`](contract.md). The
plan does not change the contract. It plans around each item as stated.

1. **Import cycle through `ToolRenderers`.** Contract 2.14 defines
   `ToolRenderers = Pick<GameTool, "renderCall" | "renderResult">`, but
   `GameTool` is in `tools/define.ts` (A1), and A1 needs U5. U5 therefore
   defines `ToolRenderers = Pick<ToolDefinition<TSchema, ToolDetails>, "renderCall" | "renderResult">`
   from the Pi types. This is the same type, because contract 2.6 has
   `GameTool = ToolDefinition<TSchema, ToolDetails>`.
2. **`glyphs.ts` cannot move unchanged.** The repository lint gives 7 errors
   on the design file (measured with the repo `biome.json`):
   `useSortedKeys` on the four 83-key objects and on `glyphSets`,
   `noEmptyBlockStatements` on `warn = () => {}`, and `noNegationElse` in
   `resolveGlyphSet`. U1a copies the file, makes `warn` a required parameter
   (contract 2.1 already calls `resolveGlyphSet(flag, env, warn)` with three
   arguments), inverts the one condition, and runs `biome check --write`,
   which sorts keys and formats. Names, glyphs and behaviour do not change.
   Graders that import `glyphs.ts` (E2) are not affected.
3. **Files that section 3.2 does not list.** This plan adds them, each with
   one owner in this area, and no other area edits them:
   `packages/harness/src/ui/draw.ts` (U1b),
   `packages/harness/test-support/ui-fixture.ts` (U1b),
   `packages/harness/test-support/pi-recorder.ts` and its test (U1c),
   `packages/harness/test-support/render-fixture.ts` (U5),
   `docs/plans/2026-09-26-pi-harness-epic/smoke-ui.md` (U11b).
   The found plan ([`found.md`](found.md), its issue 11) adds
   `test-support/fake-pi.ts` under F7a. That fake models input, shortcuts
   and the editor only, not commands, renderers, entries or
   `setFooter`/`setWidget`, so this area uses its own file with a different
   name. The two files do not share a path or an export name.
4. **Exports that the contract does not name.** U-owned files export these
   extra names. Only U-area files and tests import them:
   `draw.ts` (all of it, U1b); `footer.ts` `FooterFactory`;
   `ticker.ts` `TickerInit`;
   `renderers/line.ts` `BodyInit`, `CallInit`, `MAX_BODY_ROWS`,
   `detailsOf`, `unitGlyph`, `unitLabel`, `callLine`, `headLine`,
   `tailLines`, `collapse`, `callRenderer`, `resultRenderer`;
   `renderers/picture.ts` `MAP_MIN_WIDTH`; `install.ts` `FooterMount`,
   `Factory`, `mountFooter`, `REPAINT_GAP_MS`, `TICK_MS`;
   `extension/commands.ts` `LOG_COMMAND_ROWS`, `OFFLINE_TEXT`.
5. **`createFooter` return type.** The contract type
   `Parameters<ExtensionUIContext["setFooter"]>[0]` includes `undefined` and
   a three-parameter factory, so it cannot go to `setWidget` for the V5
   fallback. U2 returns `FooterFactory = (tui: TUI, theme: Theme) => Component`.
   That type is assignable to the contract type and to the `setWidget`
   factory type.
6. **Ticker sparklines.** Design E.3 adds damage in/out sparklines at 110
   columns and more. `TickerSource` has no damage samples, and core has no
   damage log (the damage opcodes are stubs; UG §3). U3 does not draw
   sparklines. Round 2 can add them with a damage source.
7. **Slash commands never reach the `input` event.** `agent-session.js:1219`
   runs extension commands before the input handlers (`:1230`, read in the
   installed 0.87.1 package). So F7b does not log `human/input` for `/stop`,
   `/say` and the others, and E6's `steer_landed` trigger would miss them.
   U10 appends `human/input` itself for each command, in the row shape of
   the found plan's `humanStop` (`data = { text, via: "command",
   stopReflex: false, stoppedRuns: [] }`, `text: "Human: <text>"`). `/stop`
   does not append a second row, because the found plan's `humanStop`
   already appends one (with `stoppedRuns`) when it stops the runs.
8. **`/now` output.** Contract 2.14 says `/now` prints `session.lastNow` "as
   a human line", but `HumanLineDetails` holds one `GameLogEntry`, and the
   `[now]` text can have two lines (design C.3), which a one-line card
   cannot show. U10 shows the exact text with `ctx.ui.notify`. `/log` does
   use `wow-human` entries, because those are real log rows.
9. **V5 fallback has no owner.** F8e records V5 but owns only
   `smoke-live.md`; the fallback (a 4-line `setWidget` below the editor) is
   an edit to `ui/install.ts` (U11). U11a builds both paths behind one
   module constant, `FOOTER_MOUNT`. U11b runs after F8e and BOOT, reads the
   V5 result, and flips the constant when V5 failed.
10. **Rank badge.** Design E.2 leaves the `<elite>`/`<rare>` badge out until
    G9, and D5 says the footer reads `getCreatureInfo`. `FooterSource` and
    `UnitView` carry no creature rank, so there is no path for it in the
    contract types. U2 draws no rank badge.
11. **The danger line is not in `details`.** Design E.1 wants a red `Danger:`
    line, but `formatContent` adds it only to the text content. Renderers
    read that one line from `result.content`, which the session stores and
    replays with `details`.
12. **U1 is split** into U1a (glyphs, context), U1b (draw helpers, UI
    fixtures) and U1c (fake Pi). Other areas that need "U1" (F6b:
    `setGlyphs`, `resolveGlyphSet`; E2: `tagNerdGlyphs`) need only U1a.
    U1b needs F2 because it imports contract types. U9 needs U1b (`span`).
    U11 is split into U11a (code) and U11b (pane smoke after BOOT).

## Rules that apply to every task below

- Run a single test file with `mise test <path>`. Type check with
  `bun run tsc --noEmit -p packages/harness`. Lint with `mise lint` and
  `mise format`. Full gate before the commit: `mise ci:checks`.
- `git add` the listed paths only, as its own command, then commit with
  `mise exec -- git commit`. Subjects are Conventional Commits of at most
  50 characters. Do not add AI attribution trailers (maintainer rule).
- No task in this area changes protocol or daemon behaviour, so no task
  runs `mise test:live` (AGENTS.md "Testing" applies to protocol or daemon
  changes). The live check for this area is the Orca pane smoke in U11b.
- A step that says "Expected: FAIL" names the first error line that
  `bun test` prints. Bun prints a missing module as
  `error: Cannot find module "<specifier>" from "<file>"`.


---

## Task U1a: glyph sets and the glyph context

**Needs:** F1 (the `#harness/*` imports map). **Produces for other areas:**
`resolveGlyphSet`, `setGlyphs` (F6b), `tagNerdGlyphs`, `glyphName` (E2).

**Files**

- Create: `packages/harness/src/ui/glyphs.ts` (copied from the committed design file `docs/plans/2026-09-26-pi-harness-epic/glyphs.ts`, lint fixes only; contract issue 2)
- Create: `packages/harness/src/ui/context.ts`
- Test: `packages/harness/src/ui/glyphs.test.ts`, `packages/harness/src/ui/context.test.ts`

**Interfaces**

- Consumes: `visibleWidth(text: string): number` from `@earendil-works/pi-tui`.
- Produces (`ui/glyphs.ts`, names as in the design file):

```ts
export const nerdFontsVersion = "3.4.0";
export const nerdClasses: { readonly [K in GlyphName]: { readonly class: string; readonly code: string } };
export type GlyphName = keyof typeof nerdClasses;
export const glyphSetNames: readonly ["nerd", "unicode", "ascii"];
export type GlyphSetName = (typeof glyphSetNames)[number];
export type GlyphSet = Readonly<Record<GlyphName, string>>;
export const nerd: GlyphSet;
export const unicode: GlyphSet;
export const ascii: GlyphSet;
export const glyphSets: Readonly<Record<GlyphSetName, GlyphSet>>;
export const isGlyphSetName: (value: string | undefined) => value is GlyphSetName;
export const resolveGlyphSet: (flag: string | undefined, env: string | undefined, warn: (message: string) => void) => GlyphSetName;
export const glyphNamesByChar: (set: GlyphSet) => ReadonlyMap<string, readonly GlyphName[]>;
export const glyphName: (char: string) => GlyphName | undefined;
export const tagNerdGlyphs: (screen: string) => string;
```

- Produces (`ui/context.ts`):

```ts
export function setGlyphs(name: GlyphSetName): void;
export function glyphs(): GlyphSet;
export function glyphSetName(): GlyphSetName;
```

**Steps**

- [ ] **Write the failing tests.** `packages/harness/src/ui/glyphs.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  glyphName,
  glyphNamesByChar,
  glyphSetNames,
  glyphSets,
  nerd,
  nerdClasses,
  resolveGlyphSet,
  tagNerdGlyphs,
  unicode,
} from "#harness/ui/glyphs";

const names = Object.keys(nerdClasses);

describe("glyph sets", () => {
  test("every set has the same 83 names", () => {
    expect(names).toHaveLength(83);
    for (const set of glyphSetNames) {
      expect(Object.keys(glyphSets[set]).sort()).toEqual([...names].sort());
    }
  });

  test("every glyph is one cell wide", () => {
    for (const set of glyphSetNames) {
      for (const glyph of Object.values(glyphSets[set])) {
        expect(visibleWidth(glyph)).toBe(1);
        expect(Bun.stringWidth(glyph)).toBe(1);
      }
    }
  });

  test("nerd and unicode map each glyph to one name", () => {
    for (const set of [nerd, unicode]) {
      for (const owners of glyphNamesByChar(set).values()) {
        expect(owners).toHaveLength(1);
      }
    }
  });
});

describe("resolveGlyphSet", () => {
  const quiet = () => undefined;

  test("the flag wins over the environment", () => {
    expect(resolveGlyphSet("ascii", "unicode", quiet)).toBe("ascii");
  });

  test("the environment applies when there is no flag", () => {
    expect(resolveGlyphSet(undefined, "unicode", quiet)).toBe("unicode");
  });

  test("nerd is the default", () => {
    expect(resolveGlyphSet(undefined, undefined, quiet)).toBe("nerd");
    expect(resolveGlyphSet(undefined, "", quiet)).toBe("nerd");
  });

  test("an unknown value warns once and gives nerd", () => {
    const warnings: string[] = [];
    expect(resolveGlyphSet("emoji", undefined, (m) => warnings.push(m))).toBe(
      "nerd",
    );
    expect(warnings).toEqual([
      "--glyphs=emoji is not one of nerd|unicode|ascii; using nerd",
    ]);
  });
});

describe("tagNerdGlyphs", () => {
  test("replaces each nerd glyph with its name", () => {
    const screen = `${nerd.hostile} Springpaw 8y${nerd.compassNE}`;
    expect(tagNerdGlyphs(screen)).toBe("<hostile> Springpaw 8y<compassNE>");
    expect(glyphName(nerd.corpse)).toBe("corpse");
    expect(glyphName("a")).toBeUndefined();
  });
});
```

`packages/harness/src/ui/context.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { glyphSetName, glyphs, setGlyphs } from "#harness/ui/context";
import { ascii, nerd } from "#harness/ui/glyphs";

describe("glyph context", () => {
  afterEach(() => setGlyphs("nerd"));

  test("starts with the nerd set", () => {
    expect(glyphSetName()).toBe("nerd");
    expect(glyphs()).toBe(nerd);
  });

  test("setGlyphs changes the set that glyphs returns", () => {
    setGlyphs("ascii");
    expect(glyphSetName()).toBe("ascii");
    expect(glyphs().hostile).toBe(ascii.hostile);
  });
});
```

- [ ] **Run the test and see it fail.**

```bash
mise test packages/harness/src/ui/glyphs.test.ts
```

Expected: FAIL — error: Cannot find module "#harness/ui/glyphs" from ".../src/ui/glyphs.test.ts".

- [ ] **Move the glyph module.** Copy the design file, then apply the three
  lint fixes (contract issue 2). The two `perl` edits make `warn` required
  and remove the negated condition; `biome check --write` sorts the object
  keys and formats. The result has the same 83 names and glyphs.

```bash
cd "$(git rev-parse --show-toplevel)"
mkdir -p packages/harness/src/ui
cp docs/plans/2026-09-26-pi-harness-epic/glyphs.ts packages/harness/src/ui/glyphs.ts
perl -0pi -e 's/  warn: \(message: string\) => void = \(\) => \{\},\n/  warn: (message: string) => void,\n/' packages/harness/src/ui/glyphs.ts
perl -0pi -e 's/flag !== undefined \? \["--glyphs", flag\] : \["TUICRAFT_GLYPHS", env\]/flag === undefined ? ["TUICRAFT_GLYPHS", env] : ["--glyphs", flag]/' packages/harness/src/ui/glyphs.ts
mise exec -- biome check --write packages/harness/src/ui/glyphs.ts
rg -n "warn: \(message: string\) => void,|flag === undefined" packages/harness/src/ui/glyphs.ts
```

Expected: `biome` prints `Fixed 1 file`; `rg` prints two lines. After the
move, `resolveGlyphSet` reads (formatted):

```ts
export const resolveGlyphSet = (
  flag: string | undefined,
  env: string | undefined,
  warn: (message: string) => void,
): GlyphSetName => {
  const [source, value] =
    flag === undefined ? ["TUICRAFT_GLYPHS", env] : ["--glyphs", flag];
  if (value === undefined || value === "") return "nerd";
  if (isGlyphSetName(value)) return value;
  warn(
    `${source}=${value} is not one of ${glyphSetNames.join("|")}; using nerd`,
  );
  return "nerd";
};
```

- [ ] **Write the context.** `packages/harness/src/ui/context.ts`:

```ts
import {
  type GlyphSet,
  type GlyphSetName,
  glyphSets,
} from "#harness/ui/glyphs";

let current: GlyphSetName = "nerd";

export function setGlyphs(name: GlyphSetName): void {
  current = name;
}

export function glyphs(): GlyphSet {
  return glyphSets[current];
}

export function glyphSetName(): GlyphSetName {
  return current;
}
```

- [ ] **Run the tests and see them pass.**

```bash
mise test packages/harness/src/ui/glyphs.test.ts
mise test packages/harness/src/ui/context.test.ts
bun run tsc --noEmit -p packages/harness
mise lint
mise format
```

Expected: every test passes; `tsc`, `lint` and `format` exit 0.

- [ ] **Commit.**

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add packages/harness/src/ui/glyphs.ts \
  packages/harness/src/ui/glyphs.test.ts \
  packages/harness/src/ui/context.ts \
  packages/harness/src/ui/context.test.ts
mise exec -- git commit -m "feat: Add harness glyph sets" -m "The harness UI draws Nerd Font glyphs with unicode and ascii fallbacks (R24). The module moves from the design with lint fixes only, so graders can import the same table."
```


---

## Task U1b: drawing helpers and UI test fixtures

**Needs:** U1a, F2 (contract types).

**Files**

- Create: `packages/harness/src/ui/draw.ts`
- Create: `packages/harness/test-support/ui-fixture.ts`
- Test: `packages/harness/src/ui/draw.test.ts`

**Interfaces**

- Consumes: `glyphs()`, `glyphSetName()` (U1a); `GlyphName` (U1a);
  `Domain`, `GameLogEntry`, `LogEvent` (`contract/log.ts`); `ToolStatus`
  (`contract/result.ts`); `Compass`, `NowSnapshot`, `SelfView`, `UnitView`
  (`contract/views.ts`); `FactionRelation` (`@tuicraft/core`);
  `Theme`, `ThemeColor` (`@earendil-works/pi-coding-agent`);
  `Component`, `truncateToWidth`, `stripTerminalSequences`, `visibleWidth`
  (`@earendil-works/pi-tui`).
- Produces (`ui/draw.ts`):

```ts
export type Chrome = { eighths: readonly string[]; full: string; empty: string; ellipsis: string; sep: string; rule: string; hline: string; corners: readonly [string, string, string, string]; ring: string };
export const STATUS_TONE: Readonly<Record<ToolStatus, ThemeColor>>;
export const STATUS_GLYPH: Readonly<Record<ToolStatus, GlyphName>>;
export const RELATION_TONE: Readonly<Record<FactionRelation, ThemeColor>>;
export const RELATION_GLYPH: Readonly<Record<FactionRelation, GlyphName>>;
export const COMPASS_GLYPH: Readonly<Record<Compass, GlyphName>>;
export const FACING_GLYPH: Readonly<Record<Compass, GlyphName>>;
export const DOMAIN_GLYPH: Readonly<Record<Domain, GlyphName>>;
export function chrome(): Chrome;
export function glyph(name: GlyphName): string;
export function entryGlyph(entry: GameLogEntry): string;
export function entryTone(entry: GameLogEntry): ThemeColor;
export function qualityTone(quality: number | null): ThemeColor;
export function healthTone(part: number): ThemeColor;
export function share(value: number, max: number): number;
export type BarInit = { theme: Theme; value: number; max: number; cells: number; tone: ThemeColor };
export function bar(init: BarInit): string;
export function money(theme: Theme, copper: number): string;
export function fit(line: string, width: number): string;
export function padRight(text: string, width: number): string;
export function padLeft(text: string, width: number): string;
export function hms(at: number): string;
export function span(ms: number): string;
export function seconds(ms: number): string;
export function argText(args: unknown, key: string): string | undefined;
export function drawn(draw: (width: number) => string[]): Component;
```

- Produces (`test-support/ui-fixture.ts`):

```ts
export function testTheme(): Theme;
export function plain(lines: readonly string[]): string[];
export function painted(theme: Theme, color: ThemeColor, line: string): boolean;
export function widest(lines: readonly string[]): number;
export const WIDTHS: number[];
export function unitFixture(over?: Partial<UnitView>): UnitView;
export function selfFixture(over?: Partial<SelfView>): SelfView;
export function nowFixture(over?: Partial<NowSnapshot>): NowSnapshot;
```

`testTheme()` builds a real Pi `Theme` with a distinct truecolor for each of
the 45 foreground tokens, so a test can check a colour with
`theme.getFgAnsi(token)`. Tests never check `theme.bold`: it is `chalk.bold`
and prints nothing when stdout is not a TTY (ui-gallery, read).

**Steps**

- [ ] **Write the test fixture** (the test needs it).
  `packages/harness/test-support/ui-fixture.ts`:

```ts
import { Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { NowSnapshot, SelfView, UnitView } from "#harness/contract/views";

const FG = [
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "text",
  "thinkingText",
  "userMessageText",
  "customMessageText",
  "customMessageLabel",
  "toolTitle",
  "toolOutput",
  "mdHeading",
  "mdLink",
  "mdLinkUrl",
  "mdCode",
  "mdCodeBlock",
  "mdCodeBlockBorder",
  "mdQuote",
  "mdQuoteBorder",
  "mdHr",
  "mdListBullet",
  "toolDiffAdded",
  "toolDiffRemoved",
  "toolDiffContext",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
  "thinkingOff",
  "thinkingMinimal",
  "thinkingLow",
  "thinkingMedium",
  "thinkingHigh",
  "thinkingXhigh",
  "bashMode",
] as const;

const BG = [
  "selectedBg",
  "userMessageBg",
  "customMessageBg",
  "toolPendingBg",
  "toolSuccessBg",
  "toolErrorBg",
] as const;

const hex = (index: number) =>
  `#${(0x10_00_00 + index * 0x01_01_01).toString(16)}`;

export const WIDTHS = Array.from({ length: 191 }, (_, index) => index + 30);

export function testTheme(): Theme {
  const fg = Object.fromEntries(FG.map((name, index) => [name, hex(index)]));
  const bg = Object.fromEntries(BG.map((name) => [name, "#202020"]));
  return new Theme(
    fg as Record<(typeof FG)[number], string>,
    bg as Record<(typeof BG)[number], string>,
    "truecolor",
  );
}

export function plain(lines: readonly string[]): string[] {
  return lines.map((line) => stripTerminalSequences(line));
}

export function painted(
  theme: Theme,
  color: ThemeColor,
  line: string,
): boolean {
  return line.includes(theme.getFgAnsi(color));
}

export function widest(lines: readonly string[]): number {
  return Math.max(0, ...lines.map((line) => visibleWidth(line)));
}

export function unitFixture(over: Partial<UnitView> = {}): UnitView {
  return {
    alive: true,
    attackable: true,
    attackingMe: true,
    compass: "NE",
    distance: 4,
    entry: 15_366,
    guid: "f130003c0e000123",
    hp: 35,
    hpPct: 26,
    inView: true,
    kind: "creature",
    level: 7,
    lootable: false,
    maxHp: 137,
    name: "Springpaw Stalker",
    ref: "u9",
    relation: "hostile",
    roles: [],
    seenAgoMs: 0,
    tappedByOther: false,
    targetsMe: true,
    x: 8768,
    y: -6680,
    z: 72,
    ...over,
  };
}

export function selfFixture(over: Partial<SelfView> = {}): SelfView {
  return {
    className: "Priest",
    copper: 49_975,
    freeSlots: 11,
    guid: "1a2b",
    hp: 175,
    inCombat: true,
    level: 10,
    life: "alive",
    maxHp: 217,
    maxPower: 300,
    name: "Fgklibhlflc",
    pose: {
      ageMs: 200,
      facing: "NE",
      mapId: 530,
      serverFixAgeMs: 3000,
      source: "server",
      x: 8765,
      y: -6683,
      z: 72.7,
    },
    power: 212,
    powerKind: "mana",
    race: "Blood Elf",
    xpPct: 41,
    ...over,
  };
}

export function nowFixture(over: Partial<NowSnapshot> = {}): NowSnapshot {
  const target = unitFixture();
  return {
    at: 1_790_000_000_000,
    attackers: [
      { guid: target.guid, hitAgoMs: 2000, name: target.name, ref: target.ref },
    ],
    hpDelta5s: -12,
    nearest: { hostile: target },
    noProgress: undefined,
    place: {
      ageMs: 1000,
      area: "Fairbreeze Village",
      areaId: 3462,
      zone: "Eversong Woods",
      zoneId: 3430,
    },
    recovery: undefined,
    run: {
      elapsedMs: 9000,
      id: "r4",
      kind: "engage",
      label: "engage Springpaw Stalker u9",
      progress: "Springpaw Stalker 47/137",
    },
    self: selfFixture(),
    selfCast: { elapsedMs: 400, spell: "Smite", totalMs: 1500 },
    target,
    targetAuras: [
      {
        mine: true,
        name: "Shadow Word: Pain",
        remainingMs: 14_000,
        spellId: 589,
      },
    ],
    wake: true,
    ...over,
  };
}
```

- [ ] **Write the failing test.** `packages/harness/src/ui/draw.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { GameLogEntry } from "#harness/contract/log";
import { setGlyphs } from "#harness/ui/context";
import {
  argText,
  bar,
  drawn,
  entryGlyph,
  entryTone,
  fit,
  healthTone,
  hms,
  money,
  padLeft,
  padRight,
  seconds,
  span,
} from "#harness/ui/draw";
import { ascii, nerd } from "#harness/ui/glyphs";
import { painted, plain, testTheme } from "#test-support/ui-fixture";

const theme = testTheme();

const entry = (init: Partial<GameLogEntry>): GameLogEntry => ({
  char: "Fgklibhlflc",
  class: "log",
  data: {},
  domain: "chat",
  event: "chat/in",
  seq: 1,
  text: "Kaelyn whispers › hey",
  ts: 0,
  v: 1,
  ...init,
});

describe("draw helpers", () => {
  afterEach(() => setGlyphs("nerd"));

  test("bar fills eighths and keeps its cell count", () => {
    const line = bar({
      cells: 10,
      max: 100,
      theme,
      tone: "success",
      value: 55,
    });
    expect(plain([line])[0]).toBe("█████▌····");
    expect(painted(theme, "success", line)).toBe(true);
    expect(
      visibleWidth(bar({ cells: 8, max: 0, theme, tone: "error", value: 3 })),
    ).toBe(8);
  });

  test("the ascii set draws bars with plain characters", () => {
    setGlyphs("ascii");
    expect(
      plain([bar({ cells: 4, max: 4, theme, tone: "success", value: 2 })])[0],
    ).toBe("##..");
  });

  test("money drops leading zero coins", () => {
    expect(plain([money(theme, 49_975)])[0]).toBe(
      `${nerd.gold}4 ${nerd.silver}99 ${nerd.copper}75`,
    );
    expect(plain([money(theme, 5)])[0]).toBe(`${nerd.copper}5`);
    expect(plain([money(theme, 0)])[0]).toBe(`${nerd.copper}0`);
  });

  test("healthTone splits at half and a quarter", () => {
    expect(healthTone(0.8)).toBe("success");
    expect(healthTone(0.4)).toBe("warning");
    expect(healthTone(0.1)).toBe("error");
  });

  test("text helpers count cells, not UTF-16 units", () => {
    expect(visibleWidth(padRight(`${nerd.sword} a`, 6))).toBe(6);
    expect(padLeft("7", 3)).toBe("  7");
    expect(visibleWidth(fit("abcdefgh", 5))).toBe(5);
  });

  test("time helpers", () => {
    expect(hms(new Date(2026, 8, 26, 19, 13, 2).getTime())).toBe("19:13:02");
    expect(span(12_400)).toBe("12s");
    expect(span(300_000)).toBe("5m");
    expect(seconds(1100)).toBe("1.1s");
  });

  test("argText reads strings and numbers and ignores the rest", () => {
    expect(argText({ count: 3, target: "u9" }, "target")).toBe("u9");
    expect(argText({ count: 3 }, "count")).toBe("3");
    expect(argText(undefined, "target")).toBeUndefined();
    expect(argText({ target: { nested: true } }, "target")).toBeUndefined();
  });

  test("entry style: a whisper wake gets the whisper glyph", () => {
    expect(entryGlyph(entry({ class: "wake" }))).toBe(nerd.whisper);
    expect(entryGlyph(entry({ class: "passive" }))).toBe(nerd.say);
    expect(entryGlyph(entry({ domain: "life", event: "life/dead" }))).toBe(
      nerd.death,
    );
    expect(
      entryTone(entry({ domain: "notice", event: "notice/not_implemented" })),
    ).toBe("dim");
    expect(entryTone(entry({ domain: "run", event: "run/started" }))).toBe(
      "muted",
    );
  });

  test("the glyph set follows setGlyphs", () => {
    setGlyphs("ascii");
    expect(entryGlyph(entry({ domain: "life", event: "life/dead" }))).toBe(
      ascii.death,
    );
  });

  test("drawn caches per width and cuts every line", () => {
    let calls = 0;
    const view = drawn(() => {
      calls += 1;
      return ["abcdefghij"];
    });
    expect(view.render(4)).toHaveLength(1);
    view.render(4);
    expect(calls).toBe(1);
    expect(visibleWidth(view.render(6)[0] ?? "")).toBe(6);
    expect(calls).toBe(2);
  });
});
```

- [ ] **Run the test and see it fail.**

```bash
mise test packages/harness/src/ui/draw.test.ts
```

Expected: FAIL — error: Cannot find module "#harness/ui/draw" from ".../src/ui/draw.test.ts".

- [ ] **Implement.** `packages/harness/src/ui/draw.ts`:

```ts
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth } from "@earendil-works/pi-tui";
import type { FactionRelation } from "@tuicraft/core";
import type { Domain, GameLogEntry, LogEvent } from "#harness/contract/log";
import type { ToolStatus } from "#harness/contract/result";
import type { Compass } from "#harness/contract/views";
import { glyphSetName, glyphs } from "#harness/ui/context";
import type { GlyphName } from "#harness/ui/glyphs";

export type Chrome = {
  eighths: readonly string[];
  full: string;
  empty: string;
  ellipsis: string;
  sep: string;
  rule: string;
  hline: string;
  corners: readonly [string, string, string, string];
  ring: string;
};

const BOX: Chrome = {
  corners: ["┌", "┐", "└", "┘"],
  eighths: ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"],
  ellipsis: "…",
  empty: "·",
  full: "█",
  hline: "─",
  ring: "·",
  rule: "│",
  sep: "·",
};

const PLAIN: Chrome = {
  corners: ["+", "+", "+", "+"],
  eighths: ["", "", "", "", ":", ":", ":", ":"],
  ellipsis: "~",
  empty: ".",
  full: "#",
  hline: "-",
  ring: ".",
  rule: "|",
  sep: "|",
};

export const STATUS_TONE: Readonly<Record<ToolStatus, ThemeColor>> = {
  DONE: "success",
  FAILED: "error",
  PARTLY: "warning",
  REFUSED: "error",
  RUNNING: "warning",
  UNCONFIRMED: "warning",
};

export const STATUS_GLYPH: Readonly<Record<ToolStatus, GlyphName>> = {
  DONE: "runDone",
  FAILED: "runFailed",
  PARTLY: "warning",
  REFUSED: "error",
  RUNNING: "runRunning",
  UNCONFIRMED: "warning",
};

export const RELATION_TONE: Readonly<Record<FactionRelation, ThemeColor>> = {
  friendly: "success",
  hostile: "error",
  neutral: "warning",
  unknown: "muted",
};

export const RELATION_GLYPH: Readonly<Record<FactionRelation, GlyphName>> = {
  friendly: "friendly",
  hostile: "hostile",
  neutral: "neutral",
  unknown: "neutral",
};

export const COMPASS_GLYPH: Readonly<Record<Compass, GlyphName>> = {
  E: "compassE",
  N: "compassN",
  NE: "compassNE",
  NW: "compassNW",
  S: "compassS",
  SE: "compassSE",
  SW: "compassSW",
  W: "compassW",
};

export const FACING_GLYPH: Readonly<Record<Compass, GlyphName>> = {
  E: "facingE",
  N: "facingN",
  NE: "facingNE",
  NW: "facingNW",
  S: "facingS",
  SE: "facingSE",
  SW: "facingSW",
  W: "facingW",
};

export const DOMAIN_GLYPH: Readonly<Record<Domain, GlyphName>> = {
  agent: "system",
  aura: "buff",
  chat: "say",
  combat: "combat",
  control: "route",
  entity: "neutral",
  fight: "sword",
  group: "party",
  human: "self",
  life: "death",
  loot: "loot",
  money: "gold",
  nav: "route",
  notice: "warning",
  packet: "error",
  quest: "questLog",
  run: "runRunning",
  session: "system",
  snapshot: "system",
  social: "party",
  tool: "system",
  trainer: "trainer",
  vendor: "vendor",
  xp: "xp",
};

const EVENT_GLYPH: Partial<Record<LogEvent, GlyphName>> = {
  "agent/stuck": "warning",
  "aura/fade": "debuff",
  "combat/attacked": "damageIn",
  "combat/cast": "cast",
  "combat/kill_credit": "kill",
  "life/alive": "spiritHealer",
  "life/low_health": "health",
  "life/released": "ghost",
  "life/resurrect_offer": "spiritHealer",
  "nav/refused": "warning",
  "quest/completed": "questComplete",
  "quest/rewarded": "questDone",
  "run/cancelled": "runFailed",
  "run/ended": "runDone",
  "social/duel_request": "sword",
  "xp/level_up": "levelUp",
};

const EVENT_TONE: Partial<Record<LogEvent, ThemeColor>> = {
  "agent/stuck": "warning",
  "chat/in": "accent",
  "combat/attacked": "error",
  "combat/kill_credit": "success",
  "control/server_correction": "warning",
  "life/dead": "error",
  "life/low_health": "error",
  "loot/item": "success",
  "nav/refused": "warning",
  "notice/not_implemented": "dim",
  "packet/error": "error",
  "quest/completed": "success",
  "run/cancelled": "warning",
  "session/lost": "error",
  "xp/level_up": "success",
};

const QUALITY_TONE: readonly ThemeColor[] = [
  "dim",
  "text",
  "success",
  "mdLink",
  "accent",
  "warning",
  "warning",
  "accent",
];

export function chrome(): Chrome {
  return glyphSetName() === "ascii" ? PLAIN : BOX;
}

export function glyph(name: GlyphName): string {
  return glyphs()[name];
}

export function entryGlyph(entry: GameLogEntry): string {
  if (entry.event === "chat/in" && entry.class === "wake")
    return glyph("whisper");
  return glyph(EVENT_GLYPH[entry.event] ?? DOMAIN_GLYPH[entry.domain]);
}

export function entryTone(entry: GameLogEntry): ThemeColor {
  return EVENT_TONE[entry.event] ?? (entry.class === "log" ? "muted" : "text");
}

export function qualityTone(quality: number | null): ThemeColor {
  return QUALITY_TONE[quality ?? 1] ?? "text";
}

export function healthTone(part: number): ThemeColor {
  if (part > 0.5) return "success";
  if (part > 0.25) return "warning";
  return "error";
}

export function share(value: number, max: number): number {
  return max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
}

export type BarInit = {
  theme: Theme;
  value: number;
  max: number;
  cells: number;
  tone: ThemeColor;
};

export function bar({ theme, value, max, cells, tone }: BarInit): string {
  const c = chrome();
  const eighths = Math.round(share(value, max) * cells * 8);
  const full = Math.floor(eighths / 8);
  const part = c.eighths[eighths % 8] ?? "";
  const empty = Math.max(0, cells - full - (part ? 1 : 0));
  return (
    theme.fg(tone, c.full.repeat(full) + part) +
    theme.fg("borderMuted", c.empty.repeat(empty))
  );
}

export function money(theme: Theme, copper: number): string {
  const g = glyphs();
  const coins = [
    { count: Math.floor(copper / 10_000), glyph: g.gold, tone: "warning" },
    { count: Math.floor(copper / 100) % 100, glyph: g.silver, tone: "muted" },
    { count: copper % 100, glyph: g.copper, tone: "error" },
  ] as const;
  const first = coins.findIndex((coin) => coin.count > 0);
  const shown = coins.slice(first < 0 ? 2 : first);
  return shown
    .map((coin) => `${theme.fg(coin.tone, coin.glyph)}${coin.count}`)
    .join(" ");
}

export function fit(line: string, width: number): string {
  return truncateToWidth(line, width, chrome().ellipsis);
}

export function padRight(text: string, width: number): string {
  return truncateToWidth(text, width, chrome().ellipsis, true);
}

export function padLeft(text: string, width: number): string {
  const cut = fit(text, width);
  return `${" ".repeat(Math.max(0, width - Bun.stringWidth(cut)))}${cut}`;
}

export function hms(at: number): string {
  const d = new Date(at);
  const parts = [d.getHours(), d.getMinutes(), d.getSeconds()];
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}

export function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

export function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : span(ms);
}

export function argText(args: unknown, key: string): string | undefined {
  const value: unknown =
    typeof args === "object" && args !== null
      ? Reflect.get(args, key)
      : undefined;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return typeof value === "string" ? value : undefined;
}

export function drawn(draw: (width: number) => string[]): Component {
  let cache: { width: number; lines: string[] } | undefined;
  return {
    invalidate: () => {
      cache = undefined;
    },
    render: (width) => {
      if (cache?.width !== width)
        cache = { lines: draw(width).map((line) => fit(line, width)), width };
      return cache.lines;
    },
  };
}
```

- [ ] **Run the tests and see them pass.**

```bash
mise test packages/harness/src/ui/draw.test.ts
bun run tsc --noEmit -p packages/harness
mise lint
mise format
```

Expected: every test passes; `tsc`, `lint` and `format` exit 0.

- [ ] **Commit.**

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add packages/harness/src/ui/draw.ts \
  packages/harness/src/ui/draw.test.ts \
  packages/harness/test-support/ui-fixture.ts
mise exec -- git commit -m "feat: Add harness UI drawing helpers" -m "Every UI component needs the same bars, coins, colour tokens and glyph lookups. One module keeps glyph use and cell counting consistent, and the fixtures give each UI test a real Pi theme."
```


---

## Task U1c: Pi recorder for UI and command tests

**Needs:** F1.

**Files**

- Create: `packages/harness/test-support/pi-recorder.ts`
- Test: `packages/harness/test-support/pi-recorder.test.ts`

**Interfaces**

- Consumes: `ExtensionAPI`, `ExtensionCommandContext`, `ExtensionUIContext`,
  `MessageRenderer`, `EntryRenderer`, `RegisteredCommand`
  (`@earendil-works/pi-coding-agent`); `TUI` (`@earendil-works/pi-tui`).
- Produces:

```ts
export type Call = { method: string; args: unknown[] };
export type Handler = (event: unknown, ctx: ExtensionCommandContext) => unknown;
export type Command = Omit<RegisteredCommand, "name" | "sourceInfo">;
export type UiRecorder = { ui: ExtensionUIContext; calls: Call[]; named: (method: string) => unknown[][] };
export type PiRecorder = {
  pi: ExtensionAPI;
  calls: Call[];
  commands: Map<string, Command>;
  messageRenderers: Map<string, MessageRenderer>;
  entryRenderers: Map<string, EntryRenderer>;
  entries: { customType: string; data: unknown }[];
  fire: (event: string, payload: unknown, ctx: ExtensionCommandContext) => Promise<void>;
  run: (name: string, args: string, ctx: ExtensionCommandContext) => Promise<void>;
};
export type RecorderContextInit = { ui: ExtensionUIContext; mode?: "tui" | "rpc" | "json" | "print"; contextPct?: number };
export type FakeTui = { tui: TUI; renders: () => number };
export function createUiRecorder(): UiRecorder;
export function recorderContext(init: RecorderContextInit): ExtensionCommandContext;
export function createFakeTui(): FakeTui;
export function createPiRecorder(): PiRecorder;
```

The recorders log every call they do not model (a `Proxy`), so a test can
assert "no UI call" and read calls by method name. This is not the found
area's `test-support/fake-pi.ts` (F7a), which models input, shortcuts and the
editor but not commands, renderers, entries or `setFooter`/`setWidget`
(contract issue 3).

**Steps**

- [ ] **Write the failing test.** `packages/harness/test-support/pi-recorder.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  createFakeTui,
  createPiRecorder,
  createUiRecorder,
  recorderContext,
} from "#test-support/pi-recorder";

describe("pi recorder", () => {
  test("records handlers, commands and unknown calls", async () => {
    const fake = createPiRecorder();
    const seen: unknown[] = [];
    fake.pi.on("session_start", (event) => {
      seen.push(event);
    });
    fake.pi.registerCommand("now", {
      handler: async (args) => {
        seen.push(args);
      },
    });
    fake.pi.setLabel("x", "y");
    const { ui, named } = createUiRecorder();
    const ctx = recorderContext({ contextPct: 14, ui });
    await fake.fire("session_start", { reason: "startup" }, ctx);
    await fake.run("now", "", ctx);
    ctx.ui.setTitle("hi");
    expect(seen).toEqual([{ reason: "startup" }, ""]);
    expect(fake.calls).toEqual([{ args: ["x", "y"], method: "setLabel" }]);
    expect(named("setTitle")).toEqual([["hi"]]);
    expect(ctx.getContextUsage()?.percent).toBe(14);
  });

  test("the fake tui counts render requests", () => {
    const { tui, renders } = createFakeTui();
    tui.requestRender();
    expect(renders()).toBe(1);
  });
});
```

- [ ] **Run the test and see it fail.**

```bash
mise test packages/harness/test-support/pi-recorder.test.ts
```

Expected: FAIL — error: Cannot find module "#test-support/pi-recorder" from ".../test-support/pi-recorder.test.ts".

- [ ] **Implement.** `packages/harness/test-support/pi-recorder.ts`:

```ts
import type {
  EntryRenderer,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionUIContext,
  MessageRenderer,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

export type Call = { method: string; args: unknown[] };
export type Handler = (event: unknown, ctx: ExtensionCommandContext) => unknown;
export type Command = Omit<RegisteredCommand, "name" | "sourceInfo">;

export type UiRecorder = {
  ui: ExtensionUIContext;
  calls: Call[];
  named: (method: string) => unknown[][];
};

export type PiRecorder = {
  pi: ExtensionAPI;
  calls: Call[];
  commands: Map<string, Command>;
  messageRenderers: Map<string, MessageRenderer>;
  entryRenderers: Map<string, EntryRenderer>;
  entries: { customType: string; data: unknown }[];
  fire: (
    event: string,
    payload: unknown,
    ctx: ExtensionCommandContext,
  ) => Promise<void>;
  run: (
    name: string,
    args: string,
    ctx: ExtensionCommandContext,
  ) => Promise<void>;
};

export type RecorderContextInit = {
  ui: ExtensionUIContext;
  mode?: "tui" | "rpc" | "json" | "print";
  contextPct?: number;
};

export type FakeTui = { tui: TUI; renders: () => number };

function recorder(calls: Call[], known: Record<string, unknown>): unknown {
  return new Proxy(known, {
    get: (target, key) => {
      if (typeof key !== "string") return;
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push({ args, method: key });
      };
    },
  });
}

export function createUiRecorder(): UiRecorder {
  const calls: Call[] = [];
  const ui = recorder(calls, {}) as ExtensionUIContext;
  const named = (method: string) =>
    calls.filter((call) => call.method === method).map((call) => call.args);
  return { calls, named, ui };
}

export function recorderContext({
  ui,
  mode = "tui",
  contextPct,
}: RecorderContextInit): ExtensionCommandContext {
  const usage =
    contextPct === undefined
      ? undefined
      : { contextWindow: 272_000, percent: contextPct, tokens: 1 };
  const ctx = {
    getContextUsage: () => usage,
    hasUI: true,
    isIdle: () => true,
    mode,
    model: undefined,
    ui,
  };
  return ctx as unknown as ExtensionCommandContext;
}

export function createFakeTui(): FakeTui {
  let count = 0;
  const tui = {
    requestRender: () => {
      count += 1;
    },
  };
  return { renders: () => count, tui: tui as unknown as TUI };
}

export function createPiRecorder(): PiRecorder {
  const calls: Call[] = [];
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, Command>();
  const messageRenderers = new Map<string, MessageRenderer>();
  const entryRenderers = new Map<string, EntryRenderer>();
  const entries: { customType: string; data: unknown }[] = [];
  const known = {
    appendEntry: (customType: string, data: unknown) =>
      entries.push({ customType, data }),
    getThinkingLevel: () => "high",
    on: (event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () =>
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((h) => h !== handler),
        );
    },
    registerCommand: (name: string, command: Command) =>
      commands.set(name, command),
    registerEntryRenderer: (type: string, renderer: EntryRenderer) =>
      entryRenderers.set(type, renderer),
    registerMessageRenderer: (type: string, renderer: MessageRenderer) =>
      messageRenderers.set(type, renderer),
  };
  const fire = async (
    event: string,
    payload: unknown,
    ctx: ExtensionCommandContext,
  ) => {
    for (const handler of handlers.get(event) ?? [])
      await handler(payload, ctx);
  };
  const run = async (
    name: string,
    args: string,
    ctx: ExtensionCommandContext,
  ) => {
    const command = commands.get(name);
    if (!command) throw new Error(`no command /${name}`);
    await command.handler(args, ctx);
  };
  const pi = recorder(calls, known) as ExtensionAPI;
  return {
    calls,
    commands,
    entries,
    entryRenderers,
    fire,
    messageRenderers,
    pi,
    run,
  };
}
```

- [ ] **Run the tests and see them pass.**

```bash
mise test packages/harness/test-support/pi-recorder.test.ts
bun run tsc --noEmit -p packages/harness
mise lint
mise format
```

Expected: every test passes; `tsc`, `lint` and `format` exit 0.

- [ ] **Commit.**

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add packages/harness/test-support/pi-recorder.ts \
  packages/harness/test-support/pi-recorder.test.ts
mise exec -- git commit -m "test: Add a Pi recorder for harness UI tests" -m "UI and command installers talk to Pi only through ExtensionAPI and the UI context. A recorder lets their tests run without a TUI and still check each Pi call."
```


---

## Task U2: unit-frame footer

**Needs:** U1b, U1c, F2.

**Files**

- Create: `packages/harness/src/ui/footer.ts`
- Test: `packages/harness/src/ui/footer.test.ts`

**Interfaces**

- Consumes: `NowSnapshot`, `PowerKind`, `SelfView`, `UnitView`
  (`contract/views.ts`); `ConnectionState` (`contract/config.ts`); from
  `ui/draw.ts`: `bar`, `COMPASS_GLYPH`, `FACING_GLYPH`, `fit`, `glyph`,
  `healthTone`, `chrome`, `money`, `RELATION_GLYPH`, `RELATION_TONE`,
  `seconds`, `span`; `glyphs()` (U1a); `visibleWidth`, `Component`, `TUI`
  (`@earendil-works/pi-tui`); `Theme`.
- Produces (contract names, plus `FooterFactory`, contract issue 5):

```ts
export type FooterChrome = {
  model: string;
  thinking: string;
  contextPct: number | undefined;
  wake: boolean;
  glyphSet: GlyphSetName;
  logRows: number;
  unreadWhispers: number;
  missing: ("jev" | "nav" | "factions" | "spells")[];
  connection: ConnectionState;
};
export type FooterSource = { snapshot: () => NowSnapshot | undefined; chrome: () => FooterChrome };
export type FooterFactory = (tui: TUI, theme: Theme) => Component;
export const FOOTER_ROWS = 4;
export function footerLines(init: { snapshot: NowSnapshot | undefined; chrome: FooterChrome; width: number; theme: Theme }): string[];
export function createFooter(source: FooterSource): FooterFactory;
```

Row content is design E.2, from the contract types only:

1. self: glyph, name, level, class, health and power meters, XP, combat flag
   (`DEAD`/`GHOST` replaces the meters);
2. target (relation glyph and colour, HP meter, `on you`, the first own
   debuff with time left, the own cast bar), or as a ghost: corpse distance
   and compass, reclaim timer, nearest spirit healer;
3. place, coordinates, facing, server fix age, coins, attacker count, run;
4. chrome: connection (when not online), missing capability chips (red),
   unread whispers, model, thinking, context, wake, glyph set, log rows.

Each row is a list of segments. A segment has variants from wide to narrow
and a drop rank; the fitter shrinks the highest drop rank first until the
row fits, then cuts with the ellipsis. So every row always fits and the
footer always has 4 rows (UG §2).

**Steps**

- [ ] **Write the failing test.** `packages/harness/src/ui/footer.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { setGlyphs } from "#harness/ui/context";
import {
  createFooter,
  FOOTER_ROWS,
  type FooterChrome,
  footerLines,
} from "#harness/ui/footer";
import { nerd } from "#harness/ui/glyphs";
import { createFakeTui } from "#test-support/pi-recorder";
import {
  nowFixture,
  painted,
  plain,
  selfFixture,
  testTheme,
  WIDTHS,
} from "#test-support/ui-fixture";

const theme = testTheme();

const chrome: FooterChrome = {
  connection: "online",
  contextPct: 14,
  glyphSet: "nerd",
  logRows: 212,
  missing: ["jev", "nav"],
  model: "openai-codex/gpt-6-luna",
  thinking: "high",
  unreadWhispers: 1,
  wake: true,
};

const ghost = nowFixture({
  attackers: [],
  recovery: {
    corpseCompass: "SW",
    corpseYd: 57.3,
    reclaimInMs: 12_000,
    spiritHealer: undefined,
  },
  self: selfFixture({ hp: 0, inCombat: false, life: "ghost" }),
  target: undefined,
});

describe("footerLines", () => {
  afterEach(() => setGlyphs("nerd"));

  test("draws the four rows of design E.2 at 220 columns", () => {
    const [self, target, place, last] = plain(
      footerLines({ chrome, snapshot: nowFixture(), theme, width: 220 }),
    );
    expect(self).toContain(`${nerd.self} Fgklibhlflc 10 Priest`);
    expect(self).toContain("175/217");
    expect(self).toContain(`${nerd.combat} COMBAT`);
    expect(target).toContain(`${nerd.hostile} Springpaw Stalker 7`);
    expect(target).toContain(`${nerd.damageIn} on you`);
    expect(target).toContain("Shadow Word: Pain 14s");
    expect(target).toContain(`${nerd.cast} Smite`);
    expect(place).toContain(
      `${nerd.mapPin} Eversong Woods · Fairbreeze Village`,
    );
    expect(place).toContain(`8765,-6683 ${nerd.facingNE} server 3s`);
    expect(place).toContain(`${nerd.gold}4 ${nerd.silver}99 ${nerd.copper}75`);
    expect(place).toContain(`${nerd.hostile} 1 attacking`);
    expect(place).toContain(`${nerd.runRunning} r4 engage 9s`);
    expect(last).toBe(
      `no-jev · no-nav · ${nerd.whisper} 1 unread · openai-codex/gpt-6-luna · high · ctx 14% · wake:on · glyphs:nerd · log 212 rows`,
    );
  });

  test("a ghost sees the corpse row instead of a target", () => {
    const [self, row] = plain(
      footerLines({ chrome, snapshot: ghost, theme, width: 160 }),
    );
    expect(self).toContain(`${nerd.ghost} GHOST`);
    expect(row).toContain(`${nerd.corpse} 57.3y ${nerd.compassSW}`);
    expect(row).toContain(`reclaim in ${nerd.clock} 12s`);
  });

  test("always four rows that fit, at every width from 30 to 220", () => {
    for (const snapshot of [nowFixture(), ghost, undefined]) {
      for (const width of WIDTHS) {
        const lines = footerLines({ chrome, snapshot, theme, width });
        expect(lines).toHaveLength(FOOTER_ROWS);
        for (const line of lines)
          expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });

  test("narrow widths keep the vitals and drop the extras first", () => {
    const [self] = plain(
      footerLines({ chrome, snapshot: nowFixture(), theme, width: 40 }),
    );
    expect(self).toContain(nerd.health);
    expect(self).not.toContain("41%");
  });

  test("missing capabilities and a lost link are painted", () => {
    const last =
      footerLines({
        chrome: { ...chrome, connection: "backoff" },
        snapshot: undefined,
        theme,
        width: 200,
      })[3] ?? "";
    expect(painted(theme, "error", last)).toBe(true);
    expect(plain([last])[0]).toStartWith("backoff · ");
  });

  test("waits for the world before the first snapshot", () => {
    expect(
      plain(footerLines({ chrome, snapshot: undefined, theme, width: 80 }))[0],
    ).toBe(`${nerd.idle} waiting for the world…`);
  });

  test("the ascii set draws no nerd glyph", () => {
    setGlyphs("ascii");
    const text = footerLines({
      chrome,
      snapshot: nowFixture(),
      theme,
      width: 220,
    }).join("\n");
    expect(text).not.toContain(nerd.self);
  });
});

describe("createFooter", () => {
  test("renders the source and redraws when the snapshot changes", () => {
    let snapshot = nowFixture();
    const component = createFooter({
      chrome: () => chrome,
      snapshot: () => snapshot,
    })(createFakeTui().tui, theme);
    const first = component.render(120);
    expect(component.render(120)).toBe(first);
    snapshot = nowFixture({ attackers: [] });
    expect(plain(component.render(120))[2]).not.toContain("attacking");
  });
});
```

- [ ] **Run the test and see it fail.**

```bash
mise test packages/harness/src/ui/footer.test.ts
```

Expected: FAIL — error: Cannot find module "#harness/ui/footer" from ".../src/ui/footer.test.ts".

- [ ] **Implement.** `packages/harness/src/ui/footer.ts`:

```ts
import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import type { ConnectionState } from "#harness/contract/config";
import type {
  NowSnapshot,
  PowerKind,
  SelfView,
  UnitView,
} from "#harness/contract/views";
import { glyphs } from "#harness/ui/context";
import {
  bar,
  COMPASS_GLYPH,
  FACING_GLYPH,
  fit,
  glyph,
  healthTone,
  chrome as look,
  money,
  RELATION_GLYPH,
  RELATION_TONE,
  seconds,
  span,
} from "#harness/ui/draw";
import type { GlyphName, GlyphSetName } from "#harness/ui/glyphs";

export type FooterChrome = {
  model: string;
  thinking: string;
  contextPct: number | undefined;
  wake: boolean;
  glyphSet: GlyphSetName;
  logRows: number;
  unreadWhispers: number;
  missing: ("jev" | "nav" | "factions" | "spells")[];
  connection: ConnectionState;
};

export type FooterSource = {
  snapshot: () => NowSnapshot | undefined;
  chrome: () => FooterChrome;
};

export type FooterFactory = (tui: TUI, theme: Theme) => Component;

export const FOOTER_ROWS = 4;

type Segment = { variants: string[]; drop: number };
type Row = { snapshot: NowSnapshot; theme: Theme };
type MeterInit = { theme: Theme; icon: string; value: number; max: number };
type LinesInit = {
  snapshot: NowSnapshot | undefined;
  chrome: FooterChrome;
  width: number;
  theme: Theme;
};

const GAP = "  ";

const POWER_GLYPH: Readonly<Record<Exclude<PowerKind, "none">, GlyphName>> = {
  energy: "energy",
  focus: "energy",
  mana: "mana",
  rage: "rage",
  runic_power: "spell",
};

const sep = () => look().sep;

function joined(segments: readonly Segment[], pick: readonly number[]): string {
  const parts = segments.map(
    (segment, i) => segment.variants[pick[i] ?? 0] ?? "",
  );
  return parts.filter((part) => part.length > 0).join(GAP);
}

function nextToShrink(
  segments: readonly Segment[],
  pick: readonly number[],
): number | undefined {
  let best: number | undefined;
  for (const [i, segment] of segments.entries()) {
    const room = (pick[i] ?? 0) < segment.variants.length - 1;
    if (
      room &&
      (best === undefined || segment.drop >= (segments[best]?.drop ?? 0))
    )
      best = i;
  }
  return best;
}

function fitSegments(segments: readonly Segment[], width: number): string {
  const pick = segments.map(() => 0);
  let line = joined(segments, pick);
  let next = nextToShrink(segments, pick);
  while (visibleWidth(line) > width && next !== undefined) {
    pick[next] = (pick[next] ?? 0) + 1;
    line = joined(segments, pick);
    next = nextToShrink(segments, pick);
  }
  return fit(line, width);
}

function meter({ theme, icon, value, max }: MeterInit): string[] {
  const tone = healthTone(max > 0 ? value / max : 0);
  const pct = `${max > 0 ? Math.round((100 * value) / max) : 0}%`;
  const draw = (cells: number, label: string) =>
    `${icon}${bar({ cells, max, theme, tone, value })}${label}`;
  return [
    draw(16, `${value}/${max}`),
    draw(10, `${value}/${max}`),
    draw(6, pct),
    `${icon}${pct}`,
  ];
}

function nameSegment(self: SelfView, theme: Theme): Segment {
  const g = glyphs();
  const full = `${g.self} ${theme.bold(self.name)} ${theme.fg("muted", `${self.level} ${self.className}`)}`;
  return {
    drop: 1,
    variants: [full, `${g.self} ${self.name} ${self.level}`, self.name],
  };
}

function vitalSegments(self: SelfView, theme: Theme): Segment[] {
  const g = glyphs();
  if (self.life === "dead" || self.life === "ghost") {
    const word = self.life === "ghost" ? `${g.ghost} GHOST` : `${g.death} DEAD`;
    return [{ drop: 0, variants: [theme.fg("error", word)] }];
  }
  const health = {
    drop: 2,
    variants: meter({ icon: g.health, max: self.maxHp, theme, value: self.hp }),
  };
  if (self.powerKind === "none") return [health];
  const icon = g[POWER_GLYPH[self.powerKind]];
  return [
    health,
    {
      drop: 2,
      variants: meter({ icon, max: self.maxPower, theme, value: self.power }),
    },
  ];
}

function xpSegment(self: SelfView, theme: Theme): Segment {
  if (self.xpPct === undefined) return { drop: 5, variants: [""] };
  const pct = Math.round(self.xpPct);
  const icon = glyph("xp");
  const barText = bar({
    cells: 10,
    max: 100,
    theme,
    tone: "accent",
    value: pct,
  });
  return {
    drop: 5,
    variants: [`${icon}${barText}${pct}%`, `${icon}${pct}%`, ""],
  };
}

function combatSegment(self: SelfView, theme: Theme): Segment {
  const g = glyphs();
  if (self.inCombat)
    return {
      drop: 3,
      variants: [
        theme.fg("error", `${g.combat} COMBAT`),
        theme.fg("error", g.combat),
      ],
    };
  return { drop: 3, variants: [theme.fg("dim", `${g.idle} idle`), ""] };
}

function selfRow({ snapshot, theme }: Row, width: number): string {
  const { self } = snapshot;
  const segments = [
    nameSegment(self, theme),
    ...vitalSegments(self, theme),
    xpSegment(self, theme),
    combatSegment(self, theme),
  ];
  return fitSegments(segments, width);
}

function unitHead(unit: UnitView, theme: Theme): Segment {
  const tone = RELATION_TONE[unit.relation];
  const mark = theme.fg(tone, glyph(RELATION_GLYPH[unit.relation]));
  const name = theme.fg(tone, unit.name);
  return {
    drop: 1,
    variants: [
      `${mark} ${name} ${theme.fg("muted", String(unit.level))}`,
      `${mark} ${name}`,
    ],
  };
}

function auraSegment(snapshot: NowSnapshot, theme: Theme): Segment {
  const aura = snapshot.targetAuras.find((a) => a.mine);
  if (!aura) return { drop: 6, variants: [""] };
  const left =
    aura.remainingMs === undefined ? "" : ` ${span(aura.remainingMs)}`;
  return {
    drop: 6,
    variants: [
      `${theme.fg("accent", glyph("debuff"))} ${aura.name}${left}`,
      "",
    ],
  };
}

function castSegment(snapshot: NowSnapshot, theme: Theme): Segment {
  const cast = snapshot.selfCast;
  if (!cast) return { drop: 4, variants: [""] };
  const icon = theme.fg("warning", glyph("cast"));
  const left = seconds(Math.max(0, cast.totalMs - cast.elapsedMs));
  const barText = bar({
    cells: 8,
    max: cast.totalMs,
    theme,
    tone: "warning",
    value: cast.elapsedMs,
  });
  return {
    drop: 4,
    variants: [
      `${icon} ${cast.spell} ${barText}${left}`,
      `${icon} ${left}`,
      "",
    ],
  };
}

function targetSegments(snapshot: NowSnapshot, theme: Theme): Segment[] {
  const g = glyphs();
  const unit = snapshot.target;
  if (!unit)
    return [
      {
        drop: 1,
        variants: [
          theme.fg("dim", `${g.target} no target`),
          theme.fg("dim", g.target),
        ],
      },
    ];
  const hp = {
    drop: 2,
    variants: meter({ icon: "", max: unit.maxHp, theme, value: unit.hp }),
  };
  const onYou = unit.targetsMe
    ? [theme.fg("error", `${g.damageIn} on you`), theme.fg("error", g.damageIn)]
    : [""];
  return [unitHead(unit, theme), hp, { drop: 3, variants: onYou }];
}

function healerText(unit: UnitView): string {
  const g = glyphs();
  const dist =
    unit.distance === undefined ? "" : ` ${Math.round(unit.distance)}y`;
  const where = unit.compass ? ` ${g[COMPASS_GLYPH[unit.compass]]}` : "";
  return `${g.spiritHealer} ${unit.ref}${dist}${where}`;
}

function recoverySegments(snapshot: NowSnapshot, theme: Theme): Segment[] {
  const g = glyphs();
  const r = snapshot.recovery;
  const word =
    snapshot.self.life === "ghost" ? `${g.ghost} GHOST` : `${g.death} DEAD`;
  const head = { drop: 0, variants: [theme.fg("error", word)] };
  if (!r) return [head];
  const where = r.corpseCompass ? ` ${g[COMPASS_GLYPH[r.corpseCompass]]}` : "";
  const corpse =
    r.corpseYd === undefined
      ? ""
      : `${g.corpse} ${r.corpseYd.toFixed(1)}y${where}`;
  const reclaim = r.reclaimInMs
    ? `reclaim in ${g.clock} ${seconds(r.reclaimInMs)}`
    : "reclaim ready";
  const healer = r.spiritHealer ? healerText(r.spiritHealer) : "";
  return [
    head,
    { drop: 2, variants: [corpse, ""] },
    { drop: 3, variants: [reclaim, ""] },
    { drop: 4, variants: [healer, ""] },
  ];
}

function targetRow({ snapshot, theme }: Row, width: number): string {
  const dead = snapshot.self.life === "dead" || snapshot.self.life === "ghost";
  const left = dead
    ? recoverySegments(snapshot, theme)
    : targetSegments(snapshot, theme);
  return fitSegments(
    [...left, auraSegment(snapshot, theme), castSegment(snapshot, theme)],
    width,
  );
}

function placeSegment(snapshot: NowSnapshot, theme: Theme): Segment {
  const { zone, area } = snapshot.place;
  const pin = theme.fg("accent", glyph("mapPin"));
  const name =
    [zone, area].filter((part) => part !== undefined).join(` ${sep()} `) ||
    "unknown place";
  return {
    drop: 2,
    variants: [`${pin} ${name}`, `${pin} ${area ?? zone ?? "?"}`],
  };
}

function poseSegment(snapshot: NowSnapshot, theme: Theme): Segment {
  const pose = snapshot.self.pose;
  if (!pose) return { drop: 4, variants: [theme.fg("dim", "no pose"), ""] };
  const coords = `${Math.round(pose.x)},${Math.round(pose.y)} ${glyph(FACING_GLYPH[pose.facing])}`;
  const fix =
    pose.serverFixAgeMs === undefined
      ? "no server fix"
      : `server ${span(pose.serverFixAgeMs)}`;
  return {
    drop: 4,
    variants: [`${coords} ${theme.fg("dim", fix)}`, coords, ""],
  };
}

function statusSegments(snapshot: NowSnapshot, theme: Theme): Segment[] {
  const g = glyphs();
  const count = snapshot.attackers.length;
  const attackers =
    count > 0
      ? [
          theme.fg("error", `${g.hostile} ${count} attacking`),
          theme.fg("error", `${g.hostile}${count}`),
        ]
      : [""];
  const run = snapshot.run;
  const runText = run
    ? [
        `${g.runRunning} ${run.id} ${run.kind} ${span(run.elapsedMs)}`,
        `${g.runRunning} ${run.id}`,
      ]
    : [""];
  const coins =
    snapshot.self.copper === undefined
      ? [""]
      : [money(theme, snapshot.self.copper), ""];
  return [
    { drop: 5, variants: coins },
    { drop: 1, variants: attackers },
    { drop: 1, variants: runText },
  ];
}

function placeRow({ snapshot, theme }: Row, width: number): string {
  return fitSegments(
    [
      placeSegment(snapshot, theme),
      poseSegment(snapshot, theme),
      ...statusSegments(snapshot, theme),
    ],
    width,
  );
}

function chromeRow(chrome: FooterChrome, theme: Theme, width: number): string {
  const g = glyphs();
  const ctx =
    chrome.contextPct === undefined
      ? undefined
      : `ctx ${Math.round(chrome.contextPct)}%`;
  const unread =
    chrome.unreadWhispers > 0
      ? theme.fg("accent", `${g.whisper} ${chrome.unreadWhispers} unread`)
      : undefined;
  const missing = chrome.missing.map((name) => theme.fg("error", `no-${name}`));
  const link =
    chrome.connection === "online"
      ? undefined
      : theme.fg("warning", chrome.connection);
  const wake = `wake:${chrome.wake ? "on" : "off"}`;
  const parts = [
    link,
    ...missing,
    unread,
    chrome.model,
    chrome.thinking,
    ctx,
    wake,
    `glyphs:${chrome.glyphSet}`,
    `log ${chrome.logRows} rows`,
  ];
  const text = parts
    .filter((part) => part !== undefined)
    .join(theme.fg("dim", ` ${sep()} `));
  return fit(text, width);
}

export function footerLines({
  snapshot,
  chrome,
  width,
  theme,
}: LinesInit): string[] {
  const last = chromeRow(chrome, theme, width);
  if (!snapshot)
    return [
      fit(theme.fg("dim", `${glyph("idle")} waiting for the world…`), width),
      "",
      "",
      last,
    ];
  const row = { snapshot, theme };
  return [
    selfRow(row, width),
    targetRow(row, width),
    placeRow(row, width),
    last,
  ];
}

export function createFooter(source: FooterSource): FooterFactory {
  return (_tui, theme) => {
    let last:
      | { key: string; snapshot: NowSnapshot | undefined; lines: string[] }
      | undefined;
    return {
      invalidate: () => {
        last = undefined;
      },
      render: (width) => {
        const snapshot = source.snapshot();
        const chrome = source.chrome();
        const key = `${width}|${JSON.stringify(chrome)}`;
        if (last?.key !== key || last.snapshot !== snapshot)
          last = {
            key,
            lines: footerLines({ chrome, snapshot, theme, width }),
            snapshot,
          };
        return last.lines;
      },
    };
  };
}
```

- [ ] **Run the tests and see them pass.**

```bash
mise test packages/harness/src/ui/footer.test.ts
bun run tsc --noEmit -p packages/harness
mise lint
mise format
```

Expected: every test passes; `tsc`, `lint` and `format` exit 0.

- [ ] **Commit.**

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add packages/harness/src/ui/footer.ts \
  packages/harness/src/ui/footer.test.ts
mise exec -- git commit -m "feat: Add the harness unit-frame footer" -m "The footer shows the facts the model gets in [now], so a human sees a misread early. It keeps exactly four rows at every width, so the transcript never jumps."
```


---

## Task U3: event ticker widget

**Needs:** U1b, U1c, F2.

**Files**

- Create: `packages/harness/src/ui/ticker.ts`
- Test: `packages/harness/src/ui/ticker.test.ts`

**Interfaces**

- Consumes: `GameLogEntry`, `LogEvent` (`contract/log.ts`); `RunView`
  (`contract/views.ts`); from `ui/draw.ts`: `chrome`, `entryGlyph`,
  `entryTone`, `fit`, `padLeft`, `span`; `glyphs()`.
- Produces:

```ts
export type TickerSource = { recent: (n: number) => GameLogEntry[]; run: () => RunView | undefined; kills: () => number; xp: () => number; now: () => number };
export type TickerInit = { source: TickerSource; width: number; theme: Theme; now: number };
export const TICKER_ROWS = 6;
export function tickerLines(init: TickerInit): string[];
export function createTicker(source: TickerSource): (tui: TUI, theme: Theme) => Component;
```

Row 1 is the live run (`run.progress`, else `run.label`) and the session
tally; rows 2–6 are the 5 newest log rows that a human needs, log-only rows
included (design E.3). The ticker hides rows that other surfaces already
show or that are noise: `agent/message`, `agent/now`, `entity/*`,
`human/input`, `run/progress`, `session/wake_throttled`, `snapshot/world`,
`tool/*`. The footer owns HP and mana, so the ticker does not show them.
No sparklines (contract issue 6).

**Steps**

- [ ] **Write the failing test.** `packages/harness/src/ui/ticker.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { GameLogEntry } from "#harness/contract/log";
import type { RunView } from "#harness/contract/views";
import { nerd } from "#harness/ui/glyphs";
import {
  createTicker,
  TICKER_ROWS,
  type TickerSource,
  tickerLines,
} from "#harness/ui/ticker";
import { createFakeTui } from "#test-support/pi-recorder";
import { painted, plain, testTheme, WIDTHS } from "#test-support/ui-fixture";

const theme = testTheme();
const now = 1_790_000_060_000;

const row = (seq: number, init: Partial<GameLogEntry>): GameLogEntry => ({
  char: "Fgklibhlflc",
  class: "passive",
  data: {},
  domain: "chat",
  event: "chat/in",
  seq,
  text: `row ${seq}`,
  ts: now - 10_000 + seq * 1000,
  v: 1,
  ...init,
});

const run: RunView = {
  elapsedMs: 9000,
  id: "r4",
  kind: "engage",
  label: "engage Springpaw Stalker u9",
  progress: "Springpaw Stalker L7 47/137 · dealt 90 · took 7",
};

const source = (
  rows: GameLogEntry[],
  active: RunView | undefined,
): TickerSource => ({
  kills: () => 1,
  now: () => now,
  recent: (n) => rows.slice(-n),
  run: () => active,
  xp: () => 84,
});

const entries = [
  row(1, { class: "wake", text: "Kaelyn whispers › hey, what level are you?" }),
  row(2, {
    class: "log",
    domain: "tool",
    event: "tool/call",
    text: "hidden tool call",
  }),
  row(3, {
    class: "log",
    domain: "combat",
    event: "combat/kill_credit",
    text: "Springpaw Stalker killed · +84 xp",
  }),
  row(4, {
    class: "log",
    domain: "notice",
    event: "notice/not_implemented",
    text: "SMSG_SPELLLOGEXECUTE is not handled",
  }),
];

describe("tickerLines", () => {
  test("row 1 is the live run and the session tally", () => {
    const [head] = plain(
      tickerLines({ now, source: source(entries, run), theme, width: 200 }),
    );
    expect(head).toBe(
      `${nerd.runRunning} r4 Springpaw Stalker L7 47/137 · dealt 90 · took 7 9s │ ${nerd.kill} 1 kill ${nerd.xp} +84 xp`,
    );
  });

  test("rows 2-6 hold the newest visible events, log-only ones too", () => {
    const lines = plain(
      tickerLines({ now, source: source(entries, run), theme, width: 200 }),
    );
    expect(lines.slice(1, 3)).toEqual(["   ·", "   ·"]);
    expect(lines[3]).toBe(
      `  9s ${nerd.whisper} Kaelyn whispers › hey, what level are you?`,
    );
    expect(lines[4]).toBe(
      `  7s ${nerd.kill} Springpaw Stalker killed · +84 xp`,
    );
    expect(lines[5]).toBe(
      `  6s ${nerd.warning} SMSG_SPELLLOGEXECUTE is not handled`,
    );
    expect(lines.join("\n")).not.toContain("hidden tool call");
  });

  test("not-implemented notices are grey", () => {
    const lines = tickerLines({
      now,
      source: source(entries, run),
      theme,
      width: 200,
    });
    expect(painted(theme, "dim", lines[5] ?? "")).toBe(true);
  });

  test("no run shows an idle head", () => {
    expect(
      plain(
        tickerLines({ now, source: source([], undefined), theme, width: 80 }),
      )[0],
    ).toStartWith(`${nerd.idle} no run`);
  });

  test("always six rows that fit, at every width from 30 to 220", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      row(i + 1, { text: "x".repeat(300) }),
    );
    for (const width of WIDTHS) {
      const lines = tickerLines({
        now,
        source: source(many, run),
        theme,
        width,
      });
      expect(lines).toHaveLength(TICKER_ROWS);
      for (const line of lines)
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
  });
});

describe("createTicker", () => {
  test("keeps its lines within a second and redraws when a new row arrives", () => {
    const rows = [...entries];
    const component = createTicker(source(rows, run))(
      createFakeTui().tui,
      theme,
    );
    const before = component.render(120);
    expect(component.render(120)).toBe(before);
    rows.push(row(5, { text: "a new row" }));
    expect(plain(component.render(120))[5]).toContain("a new row");
  });

  test("reads the time from the source clock, not the wall clock", () => {
    let at = now;
    const component = createTicker({ ...source(entries, run), now: () => at })(
      createFakeTui().tui,
      theme,
    );
    const before = plain(component.render(120));
    at += 60_000;
    expect(plain(component.render(120))).not.toEqual(before);
  });
});
```

- [ ] **Run the test and see it fail.**

```bash
mise test packages/harness/src/ui/ticker.test.ts
```

Expected: FAIL — error: Cannot find module "#harness/ui/ticker" from ".../src/ui/ticker.test.ts".

- [ ] **Implement.** `packages/harness/src/ui/ticker.ts`:

```ts
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { GameLogEntry, LogEvent } from "#harness/contract/log";
import type { RunView } from "#harness/contract/views";
import { glyphs } from "#harness/ui/context";
import {
  chrome,
  entryGlyph,
  entryTone,
  fit,
  padLeft,
  span,
} from "#harness/ui/draw";

export type TickerSource = {
  recent: (n: number) => GameLogEntry[];
  run: () => RunView | undefined;
  kills: () => number;
  xp: () => number;
  now: () => number;
};

export type TickerInit = {
  source: TickerSource;
  width: number;
  theme: Theme;
  now: number;
};

export const TICKER_ROWS = 6;

const EVENT_ROWS = TICKER_ROWS - 1;
const SCAN_ROWS = 200;

const HIDDEN: ReadonlySet<LogEvent> = new Set<LogEvent>([
  "agent/message",
  "agent/now",
  "entity/appear",
  "entity/disappear",
  "human/input",
  "run/progress",
  "session/wake_throttled",
  "snapshot/world",
  "tool/call",
  "tool/result",
  "tool/validation_error",
]);

function runText(run: RunView | undefined, theme: Theme): string {
  const g = glyphs();
  if (!run) return theme.fg("muted", `${g.idle} no run`);
  const what = run.progress ?? run.label;
  return `${theme.fg("warning", g.runRunning)} ${run.id} ${what} ${theme.fg("muted", span(run.elapsedMs))}`;
}

function tallyText(source: TickerSource, theme: Theme): string {
  const g = glyphs();
  const kills = source.kills();
  const word = kills === 1 ? "kill" : "kills";
  return `${theme.fg("success", `${g.kill} ${kills}`)} ${word} ${theme.fg("success", `${g.xp} +${source.xp()}`)} xp`;
}

function headRow(source: TickerSource, theme: Theme): string {
  return `${runText(source.run(), theme)}${theme.fg("dim", ` ${chrome().rule} `)}${tallyText(source, theme)}`;
}

function eventRow(entry: GameLogEntry, theme: Theme, now: number): string {
  const tone = entryTone(entry);
  const age = theme.fg("dim", padLeft(span(now - entry.ts), 4));
  return `${age} ${theme.fg(tone, entryGlyph(entry))} ${theme.fg(tone, entry.text)}`;
}

export function tickerLines({
  source,
  width,
  theme,
  now,
}: TickerInit): string[] {
  const shown = source
    .recent(SCAN_ROWS)
    .filter((entry) => !HIDDEN.has(entry.event));
  const events = shown
    .slice(-EVENT_ROWS)
    .map((entry) => eventRow(entry, theme, now));
  const padding = Array.from({ length: EVENT_ROWS - events.length }, () =>
    theme.fg("dim", `   ${chrome().empty}`),
  );
  return [headRow(source, theme), ...padding, ...events].map((line) =>
    fit(line, width),
  );
}

export function createTicker(
  source: TickerSource,
): (tui: TUI, theme: Theme) => Component {
  return (_tui, theme) => {
    let last: { key: string; lines: string[] } | undefined;
    return {
      invalidate: () => {
        last = undefined;
      },
      render: (width) => {
        const now = source.now();
        const run = source.run();
        const key = [
          width,
          Math.floor(now / 1000),
          source.recent(1)[0]?.seq,
          source.kills(),
          source.xp(),
          run?.id,
          run?.progress,
        ].join("|");
        if (last?.key !== key)
          last = { key, lines: tickerLines({ now, source, theme, width }) };
        return last.lines;
      },
    };
  };
}
```

- [ ] **Run the tests and see them pass.**

```bash
mise test packages/harness/src/ui/ticker.test.ts
bun run tsc --noEmit -p packages/harness
mise lint
mise format
```

Expected: every test passes; `tsc`, `lint` and `format` exit 0.

- [ ] **Commit.**

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add packages/harness/src/ui/ticker.ts \
  packages/harness/src/ui/ticker.test.ts
mise exec -- git commit -m "feat: Add the harness event ticker" -m "The human needs to see game events that never reach the model, such as kills inside a cycle and not-implemented notices. A fixed six-row widget shows them without moving the editor."
```


---

## Task U4: event cards and human-only lines

**Needs:** U1b, F2.

**Files**

- Create: `packages/harness/src/ui/cards.ts`
- Test: `packages/harness/src/ui/cards.test.ts`

**Interfaces**

- Consumes: `GameLogEntry`, `WowEventDetails`, `HumanLineDetails`
  (`contract/log.ts`); `MessageRenderer`, `EntryRenderer`, `Theme`
  (`@earendil-works/pi-coding-agent`); from `ui/draw.ts`: `chrome`, `drawn`,
  `entryGlyph`, `entryTone`, `hms`, `padRight`.
- Produces:

```ts
export const renderEventCard: MessageRenderer<WowEventDetails>;
export const renderHumanLine: EntryRenderer<HumanLineDetails>;
```

One line per entry: domain glyph, `HH:MM:SS`, the harness-written `text`
(design E.3). Events that arrive together share one message (L9 sends
them in one `wow-event`). `ctrl+o` (`options.expanded`) adds up to 8 typed
`data` rows per entry. A passive digest and a human-only line are muted. A
message without entries returns `undefined`, so Pi draws its default box.

**Steps**

- [ ] **Write the failing test.** `packages/harness/src/ui/cards.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type {
  EntryRenderer,
  MessageRenderer,
} from "@earendil-works/pi-coding-agent";
import type {
  GameLogEntry,
  HumanLineDetails,
  WowEventDetails,
} from "#harness/contract/log";
import { renderEventCard, renderHumanLine } from "#harness/ui/cards";
import { hms } from "#harness/ui/draw";
import { nerd } from "#harness/ui/glyphs";
import { painted, plain, testTheme } from "#test-support/ui-fixture";

const theme = testTheme();
const at = new Date(2026, 8, 26, 19, 13, 2).getTime();

const whisper: GameLogEntry = {
  char: "Fgklibhlflc",
  class: "wake",
  data: { sender: "Kaelyn", text: "hey, what level are you?", type: "whisper" },
  domain: "chat",
  event: "chat/in",
  seq: 7,
  text: "Kaelyn whispers › hey, what level are you?",
  ts: at,
  v: 1,
};

const death: GameLogEntry = {
  ...whisper,
  data: {},
  domain: "life",
  event: "life/dead",
  seq: 8,
  text: "You died › Springpaw Stalker L7 · Next: recover()",
  ts: at + 1000,
};

const message = (
  details: WowEventDetails | undefined,
): Parameters<MessageRenderer<WowEventDetails>>[0] => ({
  content: "[game 0s] ...",
  customType: "wow-event",
  details,
  display: true,
  role: "custom",
  timestamp: at,
});

const human = (
  entry: GameLogEntry | undefined,
): Parameters<EntryRenderer<HumanLineDetails>>[0] => ({
  customType: "wow-human",
  data: entry ? { entry } : undefined,
  id: "e1",
  parentId: null,
  timestamp: "2026-09-26T19:13:02Z",
  type: "custom",
});

describe("renderEventCard", () => {
  test("one line per event: glyph, time, text", () => {
    const view = renderEventCard(
      message({ entries: [whisper, death], kind: "wake" }),
      { expanded: false, outputPad: 1 },
      theme,
    );
    const lines = plain(view?.render(120) ?? []);
    expect(lines).toEqual([
      ` ${nerd.whisper} 19:13:02 Kaelyn whispers › hey, what level are you?`,
      ` ${nerd.death} ${hms(at + 1000)} You died › Springpaw Stalker L7 · Next: recover() (ctrl+o)`,
    ]);
  });

  test("ctrl+o shows the typed rows", () => {
    const view = renderEventCard(
      message({ entries: [whisper], kind: "wake" }),
      { expanded: true, outputPad: 0 },
      theme,
    );
    const lines = plain(view?.render(120) ?? []);
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe("  │ sender      Kaelyn");
  });

  test("a death card is red and a passive digest is muted", () => {
    const wake = renderEventCard(
      message({ entries: [death], kind: "wake" }),
      { expanded: false, outputPad: 0 },
      theme,
    );
    expect(painted(theme, "error", wake?.render(120)[0] ?? "")).toBe(true);
    const passive = renderEventCard(
      message({ entries: [death], kind: "passive" }),
      { expanded: false, outputPad: 0 },
      theme,
    );
    expect(painted(theme, "muted", passive?.render(120)[0] ?? "")).toBe(true);
  });

  test("no details gives Pi's default box", () => {
    expect(
      renderEventCard(
        message(undefined),
        { expanded: false, outputPad: 0 },
        theme,
      ),
    ).toBeUndefined();
    expect(
      renderEventCard(
        message({ entries: [], kind: "wake" }),
        { expanded: false, outputPad: 0 },
        theme,
      ),
    ).toBeUndefined();
  });
});

describe("renderHumanLine", () => {
  test("draws one muted line that the model never sees", () => {
    const view = renderHumanLine(human(death), { expanded: false }, theme);
    const line = view?.render(120)[0] ?? "";
    expect(plain([line])[0]).toBe(
      ` ${nerd.death} ${hms(at + 1000)} You died › Springpaw Stalker L7 · Next: recover()`,
    );
    expect(painted(theme, "muted", line)).toBe(true);
  });

  test("an entry without data draws nothing", () => {
    expect(
      renderHumanLine(human(undefined), { expanded: false }, theme),
    ).toBeUndefined();
  });
});
```

- [ ] **Run the test and see it fail.**

```bash
mise test packages/harness/src/ui/cards.test.ts
```

Expected: FAIL — error: Cannot find module "#harness/ui/cards" from ".../src/ui/cards.test.ts".

- [ ] **Implement.** `packages/harness/src/ui/cards.ts`:

```ts
import type {
  EntryRenderer,
  MessageRenderer,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type {
  GameLogEntry,
  HumanLineDetails,
  WowEventDetails,
} from "#harness/contract/log";
import {
  chrome,
  drawn,
  entryGlyph,
  entryTone,
  hms,
  padRight,
} from "#harness/ui/draw";

type CardInit = {
  entries: readonly GameLogEntry[];
  expanded: boolean;
  theme: Theme;
  indent: string;
  muted: boolean;
};

const DATA_ROWS = 8;
const VALUE_CHARS = 80;
const KEY_CELLS = 11;

function valueText(value: unknown): string {
  const text =
    typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  return text.length > VALUE_CHARS
    ? `${text.slice(0, VALUE_CHARS - 1)}${chrome().ellipsis}`
    : text;
}

function dataRows(entry: GameLogEntry, theme: Theme, indent: string): string[] {
  const rule = theme.fg("borderMuted", chrome().rule);
  const rows = Object.entries(entry.data).slice(0, DATA_ROWS);
  return rows.map(
    ([key, value]) =>
      `${indent}  ${rule} ${theme.fg("muted", padRight(key, KEY_CELLS))} ${valueText(value)}`,
  );
}

function entryLine(entry: GameLogEntry, init: CardInit): string {
  const { theme, indent } = init;
  const tone = init.muted ? "muted" : entryTone(entry);
  return `${indent}${theme.fg(tone, entryGlyph(entry))} ${theme.fg("dim", hms(entry.ts))} ${theme.fg(tone, entry.text)}`;
}

function cardLines(init: CardInit): string[] {
  const { entries, expanded, theme, indent } = init;
  const lines = entries.flatMap((entry) => [
    entryLine(entry, init),
    ...(expanded ? dataRows(entry, theme, indent) : []),
  ]);
  const hasData = entries.some((entry) => Object.keys(entry.data).length > 0);
  const hint = !expanded && hasData ? theme.fg("dim", " (ctrl+o)") : "";
  return lines.map((line, i) =>
    i === lines.length - 1 ? `${line}${hint}` : line,
  );
}

export const renderEventCard: MessageRenderer<WowEventDetails> = (
  message,
  options,
  theme,
) => {
  const details = message.details;
  if (!details || details.entries.length === 0) return;
  const init = {
    entries: details.entries,
    expanded: options.expanded,
    indent: " ".repeat(options.outputPad),
    muted: details.kind === "passive",
    theme,
  };
  return drawn(() => cardLines(init));
};

export const renderHumanLine: EntryRenderer<HumanLineDetails> = (
  entry,
  options,
  theme,
) => {
  const line = entry.data?.entry;
  if (!line) return;
  return drawn(() =>
    cardLines({
      entries: [line],
      expanded: options.expanded,
      indent: " ",
      muted: true,
      theme,
    }),
  );
};
```

- [ ] **Run the tests and see them pass.**

```bash
mise test packages/harness/src/ui/cards.test.ts
bun run tsc --noEmit -p packages/harness
mise lint
mise format
```

Expected: every test passes; `tsc`, `lint` and `format` exit 0.

- [ ] **Commit.**

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add packages/harness/src/ui/cards.ts \
  packages/harness/src/ui/cards.test.ts
mise exec -- git commit -m "feat: Draw game event cards and human lines" -m "Without a renderer Pi draws each pushed game event as a purple box of five rows or more. One line per event keeps wakes readable, and human-only lines never reach the model."
```


---

## Task U9: tab title and working message

**Needs:** U1b (`span`), F2.

**Files**

- Create: `packages/harness/src/ui/status-line.ts`
- Test: `packages/harness/src/ui/status-line.test.ts`

**Interfaces**

- Consumes: `NowSnapshot`, `RunView` (`contract/views.ts`); `RunKind`
  (`contract/runs.ts`); `span` (U1b).
- Produces:

```ts
export function titleFor(snapshot: NowSnapshot | undefined): string;
export function workingMessage(run: RunView | undefined): string | undefined;
```

`titleFor` gives `<name> L<level> <hp>%`, adds `ATTACKED` when an attacker
is known, and gives `<name> L<level> DEAD|GHOST` when dead (design E.2,
REPORT §5.2 row 22). `workingMessage` gives `walking 23 yd → corpse (r4, 9s)`
style text in game words; `undefined` restores Pi's default message.

**Steps**

- [ ] **Write the failing test.** `packages/harness/src/ui/status-line.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { titleFor, workingMessage } from "#harness/ui/status-line";
import { nowFixture, selfFixture } from "#test-support/ui-fixture";

describe("titleFor", () => {
  test("puts danger in the tab title", () => {
    expect(titleFor(nowFixture())).toBe("Fgklibhlflc L10 81% ATTACKED");
  });

  test("a calm character shows health only", () => {
    expect(titleFor(nowFixture({ attackers: [] }))).toBe("Fgklibhlflc L10 81%");
  });

  test("death shows the life state", () => {
    expect(titleFor(nowFixture({ self: selfFixture({ life: "ghost" }) }))).toBe(
      "Fgklibhlflc L10 GHOST",
    );
  });

  test("no snapshot gives the program name", () => {
    expect(titleFor(undefined)).toBe("tuicraft");
  });
});

describe("workingMessage", () => {
  test("shows the run in game words", () => {
    const run = {
      elapsedMs: 9000,
      id: "r4",
      kind: "travel" as const,
      label: "travel corpse",
      progress: "23 yd → corpse",
    };
    expect(workingMessage(run)).toBe("walking 23 yd → corpse (r4, 9s)");
  });

  test("uses the label before the first progress text", () => {
    const run = {
      elapsedMs: 2000,
      id: "r5",
      kind: "engage" as const,
      label: "engage Springpaw Stalker u9",
      progress: undefined,
    };
    expect(workingMessage(run)).toBe("engage Springpaw Stalker u9 (r5, 2s)");
  });

  test("no run restores the default message", () => {
    expect(workingMessage(undefined)).toBeUndefined();
  });
});
```

- [ ] **Run the test and see it fail.**

```bash
mise test packages/harness/src/ui/status-line.test.ts
```

Expected: FAIL — error: Cannot find module "#harness/ui/status-line" from ".../src/ui/status-line.test.ts".

- [ ] **Implement.** `packages/harness/src/ui/status-line.ts`:

```ts
import type { RunKind } from "#harness/contract/runs";
import type { NowSnapshot, RunView } from "#harness/contract/views";
import { span } from "#harness/ui/draw";

const VERB: Readonly<Record<RunKind, string>> = {
  engage: "fighting",
  recover: "recovering",
  rest: "resting",
  travel: "walking",
};

export function titleFor(snapshot: NowSnapshot | undefined): string {
  if (!snapshot) return "tuicraft";
  const { self, attackers } = snapshot;
  const base = `${self.name} L${self.level}`;
  if (self.life === "dead" || self.life === "ghost")
    return `${base} ${self.life.toUpperCase()}`;
  const hp = `${self.maxHp > 0 ? Math.round((100 * self.hp) / self.maxHp) : 0}%`;
  return attackers.length > 0 ? `${base} ${hp} ATTACKED` : `${base} ${hp}`;
}

export function workingMessage(run: RunView | undefined): string | undefined {
  if (!run) return;
  const what =
    run.progress === undefined
      ? run.label
      : `${VERB[run.kind]} ${run.progress}`;
  return `${what} (${run.id}, ${span(run.elapsedMs)})`;
}
```

- [ ] **Run the tests and see them pass.**

```bash
mise test packages/harness/src/ui/status-line.test.ts
bun run tsc --noEmit -p packages/harness
mise lint
mise format
```

Expected: every test passes; `tsc`, `lint` and `format` exit 0.

- [ ] **Commit.**

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add packages/harness/src/ui/status-line.ts \
  packages/harness/src/ui/status-line.test.ts
mise exec -- git commit -m "feat: Put danger in the tab title" -m "The maintainer often watches another tab. An ATTACKED tab title and a working message in game words show danger and the active run without a look at the pane."
```


---

## Task U5: renderer registry, shared renderer helpers and the line family

**Needs:** U1b, F2. **Produces for other areas:** `rendererFor` (A1's
`installTools` spreads it into each tool).

**Files**

- Create: `packages/harness/src/ui/renderers/registry.ts` (U6, U7 and U8 later replace
  their `{}` map values and add one import each; nothing else changes)
- Create: `packages/harness/src/ui/renderers/line.ts`
- Create: `packages/harness/test-support/render-fixture.ts`
- Test: `packages/harness/src/ui/renderers/registry.test.ts`, `packages/harness/src/ui/renderers/line.test.ts`

**Interfaces**

- Consumes: `AfterMap`, `ToolDetails` (`contract/details.ts`); `ToolName`,
  `ToolResult` (`contract/result.ts`); `UnitView` (`contract/views.ts`);
  `NpcRole` (`@tuicraft/core`); `AgentToolResult`
  (`@earendil-works/pi-agent-core`); `ToolDefinition`,
  `ToolRenderResultOptions`, `Theme` (`@earendil-works/pi-coding-agent`);
  `TSchema` (`@earendil-works/pi-ai`); from `ui/draw.ts`: `argText`, `drawn`,
  `glyph`, `RELATION_GLYPH`, `RELATION_TONE`, `STATUS_GLYPH`, `STATUS_TONE`.
- Produces (`renderers/registry.ts`, contract issue 1 for the type):

```ts
export type ToolRenderers = Pick<ToolDefinition<TSchema, ToolDetails>, "renderCall" | "renderResult">;
export function rendererFor(tool: ToolName): ToolRenderers;
```

- Produces (`renderers/line.ts`; the helpers are for U6–U8, contract issue 4):

```ts
export type BodyInit<K extends ToolName> = { after: AfterMap[K]; result: ToolResult<AfterMap[K]>; theme: Theme; expanded: boolean; running: boolean; width: number };
export type CallInit = { theme: Theme; icon: GlyphName; verb: string; parts: (string | undefined)[] };
export const MAX_BODY_ROWS = 5;
export function detailsOf<K extends ToolName>(result: AgentToolResult<ToolDetails>, tool: K): ToolResult<AfterMap[K]>;
export function unitGlyph(unit: UnitView): string;
export function unitLabel(theme: Theme, unit: UnitView): string;
export function callLine(init: CallInit): string;
export function headLine(theme: Theme, result: ToolResult<unknown>): string;
export function tailLines(theme: Theme, content: AgentToolResult<ToolDetails>["content"], result: ToolResult<unknown>): string[];
export function collapse(theme: Theme, lines: readonly string[], expanded: boolean): string[];
export function callRenderer(draw: (args: unknown, theme: Theme) => string): ToolRenderers["renderCall"];
export function resultRenderer<K extends ToolName>(tool: K, body: (init: BodyInit<K>) => string[]): ToolRenderers["renderResult"];
export const socialRenderers: ToolRenderers;
export const stopRenderers: ToolRenderers;
```

- Produces (`test-support/render-fixture.ts`):

```ts
export type RenderInit = { options?: ToolRenderResultOptions; text?: string; width?: number };
export const closed: ToolRenderResultOptions;
export const open: ToolRenderResultOptions;
export const partial: ToolRenderResultOptions;
export function toolResult<K extends ToolName>(tool: K, result: ToolResult<AfterMap[K]>, text?: string): { content: { text: string; type: "text" }[]; details: ToolDetails };
export function renderResultLines<K extends ToolName>(tool: K, result: ToolResult<AfterMap[K]>, init?: RenderInit): string[];
export function renderCallLine(tool: ToolName, args: Record<string, unknown>): string;
```

Rules every family follows (design E.1, contract 2.14): draw only from
`details` and the one `Danger:` line of the content (contract issue 11);
status colour from `STATUS_TONE`; a collapsed body has at most 5 rows, and a
longer one ends with `+<n> more (ctrl+o)`; `renderCall` is one line; the
run id shows in the `RUNNING` head line (it is `result.runId`, not an
argument); `args` arrive as `unknown` (`Static<TSchema>`), so `argText`
reads each field; a renderer that gets the wrong tool throws, and Pi then
draws the plain text (LR §4).

**Steps**

- [ ] **Write the render fixture** (the tests need it).
  `packages/harness/test-support/render-fixture.ts`:

```ts
import type { ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import type { AfterMap, ToolDetails } from "#harness/contract/details";
import type { ToolName, ToolResult } from "#harness/contract/result";
import { rendererFor } from "#harness/ui/renderers/registry";
import { plain, testTheme } from "#test-support/ui-fixture";

export type RenderInit = {
  options?: ToolRenderResultOptions;
  text?: string;
  width?: number;
};

export const closed: ToolRenderResultOptions = {
  expanded: false,
  isPartial: false,
};
export const open: ToolRenderResultOptions = {
  expanded: true,
  isPartial: false,
};
export const partial: ToolRenderResultOptions = {
  expanded: false,
  isPartial: true,
};

const theme = testTheme();

export function toolResult<K extends ToolName>(
  tool: K,
  result: ToolResult<AfterMap[K]>,
  text = "",
) {
  const details = { result, tool } as ToolDetails;
  return { content: [{ text, type: "text" as const }], details };
}

export function renderResultLines<K extends ToolName>(
  tool: K,
  result: ToolResult<AfterMap[K]>,
  init: RenderInit = {},
): string[] {
  const render = rendererFor(tool).renderResult;
  if (!render) throw new Error(`no renderer for ${tool}`);
  const component = render(
    toolResult(tool, result, init.text),
    init.options ?? closed,
    theme,
    undefined as never,
  );
  return component.render(init.width ?? 120);
}

export function renderCallLine(
  tool: ToolName,
  args: Record<string, unknown>,
): string {
  const render = rendererFor(tool).renderCall;
  if (!render) throw new Error(`no renderer for ${tool}`);
  return plain(render(args, theme, undefined as never).render(120))[0] ?? "";
}
```

- [ ] **Write the failing tests.** `packages/harness/src/ui/renderers/registry.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ToolName } from "#harness/contract/result";
import { rendererFor } from "#harness/ui/renderers/registry";

const TOOLS: ToolName[] = [
  "look",
  "travel",
  "engage",
  "loot",
  "interact",
  "rest",
  "recover",
  "social",
  "journal",
  "stop",
];

describe("rendererFor", () => {
  test("every tool has both renderers or neither, so Pi falls back cleanly", () => {
    for (const tool of TOOLS) {
      const renderers = rendererFor(tool);
      expect(renderers.renderCall === undefined).toBe(
        renderers.renderResult === undefined,
      );
    }
  });

  test("the line family is built", () => {
    for (const tool of ["social", "stop"] as const) {
      expect(rendererFor(tool).renderCall).toBeFunction();
      expect(rendererFor(tool).renderResult).toBeFunction();
    }
  });
});
```

`packages/harness/src/ui/renderers/line.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { AfterMap } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import { nerd } from "#harness/ui/glyphs";
import { collapse, detailsOf, headLine } from "#harness/ui/renderers/line";
import {
  open,
  renderCallLine,
  renderResultLines,
  toolResult,
} from "#test-support/render-fixture";
import { painted, plain, testTheme } from "#test-support/ui-fixture";

const theme = testTheme();

const said: ToolResult<AfterMap["social"]> = {
  after: {
    action: "whisper",
    confirmed: true,
    systemLine: undefined,
    text: "level 10",
    to: "Kaelyn",
  },
  body: [],
  detail: "whispered Kaelyn.",
  evidence: [{ domain: "chat", event: "chat/out", seq: 41 }],
  status: "DONE",
};

describe("line family", () => {
  test("social call line names the action and the player", () => {
    expect(renderCallLine("social", { text: "level 10", to: "Kaelyn" })).toBe(
      `${nerd.whisper} social whisper → Kaelyn "level 10"`,
    );
    expect(renderCallLine("social", { text: "hi" })).toBe(
      `${nerd.say} social say "hi"`,
    );
  });

  test("collapsed social result is one green status line", () => {
    const lines = renderResultLines("social", said);
    expect(plain(lines)).toEqual([`${nerd.runDone} DONE whispered Kaelyn.`]);
    expect(painted(theme, "success", lines[0] ?? "")).toBe(true);
  });

  test("expanded social result adds the echo and evidence rows", () => {
    expect(
      plain(renderResultLines("social", said, { options: open })).slice(1),
    ).toEqual(["the server echo confirmed it", "#41 chat/out"]);
  });

  test("a refusal is red, shows its reason, danger and next lines", () => {
    const refused = {
      ...said,
      detail: "the human wrote a message.",
      next: "read it.",
      reason: "human_waiting",
      status: "REFUSED" as const,
    };
    const text =
      "REFUSED ...\nDanger: Springpaw Stalker u9 is attacking you. You are at 23% HP.";
    const lines = renderResultLines("social", refused, { text });
    expect(plain(lines)).toEqual([
      `${nerd.error} REFUSED human_waiting: the human wrote a message.`,
      `${nerd.warning} Danger: Springpaw Stalker u9 is attacking you. You are at 23% HP.`,
      "Next: read it.",
    ]);
    expect(painted(theme, "error", lines[0] ?? "")).toBe(true);
  });

  test("stop call and expanded result list the stopped runs", () => {
    expect(renderCallLine("stop", {})).toBe(
      `${nerd.runFailed} stop everything`,
    );
    const record = {
      args: {},
      awaited: false,
      endedAt: 2,
      id: "r3",
      kind: "engage" as const,
      progress: undefined,
      reason: "stopped_by_tool",
      startedAt: 1,
      status: "cancelled" as const,
      summary: undefined,
      toolCallId: undefined,
    };
    const stopped: ToolResult<AfterMap["stop"]> = {
      after: {
        attackers: [],
        self: {
          hp: 175,
          maxHp: 217,
          maxPower: 300,
          power: 212,
          powerKind: "mana",
        },
        stopped: [record],
      },
      body: [],
      detail: "stopped r3 (engage).",
      status: "DONE",
    };
    expect(
      plain(renderResultLines("stop", stopped, { options: open })).slice(1),
    ).toEqual(["r3 engage cancelled stopped_by_tool", "HP 175/217"]);
  });

  test("a running result shows its run id", () => {
    const running = { ...said, runId: "r4", status: "RUNNING" as const };
    expect(plain([headLine(theme, running)])[0]).toBe(
      `${nerd.runRunning} RUNNING r4: whispered Kaelyn.`,
    );
  });

  test("collapse keeps five rows and counts the rest", () => {
    const lines = collapse(theme, ["a", "b", "c", "d", "e", "f", "g"], false);
    expect(plain(lines)).toEqual([
      "a",
      "b",
      "c",
      "d",
      `${nerd.clock} +3 more (ctrl+o)`,
    ]);
    expect(collapse(theme, ["a", "b"], false)).toEqual(["a", "b"]);
  });

  test("detailsOf refuses the wrong tool so Pi falls back to the text", () => {
    expect(() => detailsOf(toolResult("social", said), "stop")).toThrow(
      "renderer for stop got social",
    );
  });
});
```

- [ ] **Run the test and see it fail.**

```bash
mise test packages/harness/src/ui/renderers/line.test.ts
```

Expected: FAIL — error: Cannot find module "#harness/ui/renderers/line" from ".../src/ui/renderers/line.test.ts".

- [ ] **Implement the registry.** `packages/harness/src/ui/renderers/registry.ts`:

```ts
import type { TSchema } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ToolDetails } from "#harness/contract/details";
import type { ToolName } from "#harness/contract/result";
import { socialRenderers, stopRenderers } from "#harness/ui/renderers/line";

export type ToolRenderers = Pick<
  ToolDefinition<TSchema, ToolDetails>,
  "renderCall" | "renderResult"
>;

const RENDERERS: Readonly<Record<ToolName, ToolRenderers>> = {
  engage: {},
  interact: {},
  journal: {},
  look: {},
  loot: {},
  recover: {},
  rest: {},
  social: socialRenderers,
  stop: stopRenderers,
  travel: {},
};

export function rendererFor(tool: ToolName): ToolRenderers {
  return RENDERERS[tool];
}
```

- [ ] **Implement the line family and the helpers.** `packages/harness/src/ui/renderers/line.ts`:

```ts
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { NpcRole } from "@tuicraft/core";
import type { AfterMap, ToolDetails } from "#harness/contract/details";
import type { ToolName, ToolResult } from "#harness/contract/result";
import type { UnitView } from "#harness/contract/views";
import { glyphs } from "#harness/ui/context";
import {
  argText,
  drawn,
  glyph,
  RELATION_GLYPH,
  RELATION_TONE,
  STATUS_GLYPH,
  STATUS_TONE,
} from "#harness/ui/draw";
import type { GlyphName } from "#harness/ui/glyphs";
import type { ToolRenderers } from "#harness/ui/renderers/registry";

export type BodyInit<K extends ToolName> = {
  after: AfterMap[K];
  result: ToolResult<AfterMap[K]>;
  theme: Theme;
  expanded: boolean;
  running: boolean;
  width: number;
};

export type CallInit = {
  theme: Theme;
  icon: GlyphName;
  verb: string;
  parts: (string | undefined)[];
};

type Content = AgentToolResult<ToolDetails>["content"];

export const MAX_BODY_ROWS = 5;

const ROLE_GLYPH: Partial<Record<NpcRole, GlyphName>> = {
  flight_master: "flightMaster",
  questgiver: "questgiver",
  repair: "vendor",
  spirit_guide: "spiritHealer",
  spirit_healer: "spiritHealer",
  trainer: "trainer",
  vendor: "vendor",
};

export function detailsOf<K extends ToolName>(
  result: AgentToolResult<ToolDetails>,
  tool: K,
): ToolResult<AfterMap[K]> {
  if (result.details.tool !== tool)
    throw new Error(`renderer for ${tool} got ${result.details.tool}`);
  return result.details.result as ToolResult<AfterMap[K]>;
}

export function unitGlyph(unit: UnitView): string {
  if (!unit.alive) return glyph(unit.lootable ? "lootable" : "dead");
  const role = unit.roles
    .map((r) => ROLE_GLYPH[r])
    .find((name) => name !== undefined);
  return glyph(role ?? RELATION_GLYPH[unit.relation]);
}

export function unitLabel(theme: Theme, unit: UnitView): string {
  const tone = unit.alive ? RELATION_TONE[unit.relation] : "dim";
  return `${theme.fg(tone, `${unitGlyph(unit)} ${unit.name}`)} ${theme.fg("dim", unit.ref)}`;
}

export function callLine({ theme, icon, verb, parts }: CallInit): string {
  const rest = parts
    .filter((part) => part !== undefined && part.length > 0)
    .join(" ");
  const tail = rest ? ` ${theme.fg("muted", rest)}` : "";
  return `${theme.fg("accent", glyph(icon))} ${theme.fg("toolTitle", theme.bold(verb))}${tail}`;
}

export function headLine(theme: Theme, result: ToolResult<unknown>): string {
  const tone = STATUS_TONE[result.status];
  const tag = result.status === "RUNNING" ? result.runId : result.reason;
  const repeat =
    result.reason === "repeat"
      ? theme.fg("dim", ` ${glyph("clock")} repeat`)
      : "";
  const label = `${glyph(STATUS_GLYPH[result.status])} ${result.status}${tag ? ` ${tag}:` : ""}`;
  return `${theme.fg(tone, label)} ${result.detail}${repeat}`;
}

export function tailLines(
  theme: Theme,
  content: Content,
  result: ToolResult<unknown>,
): string[] {
  const text = content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
  const danger = text.split("\n").find((line) => line.startsWith("Danger:"));
  const lines = danger
    ? [theme.fg("error", `${glyph("warning")} ${danger}`)]
    : [];
  return result.next
    ? [...lines, theme.fg("dim", `Next: ${result.next}`)]
    : lines;
}

export function collapse(
  theme: Theme,
  lines: readonly string[],
  expanded: boolean,
): string[] {
  if (expanded || lines.length <= MAX_BODY_ROWS) return [...lines];
  const more = lines.length - (MAX_BODY_ROWS - 1);
  return [
    ...lines.slice(0, MAX_BODY_ROWS - 1),
    theme.fg("dim", `${glyphs().clock} +${more} more (ctrl+o)`),
  ];
}

export function callRenderer(
  draw: (args: unknown, theme: Theme) => string,
): ToolRenderers["renderCall"] {
  return (args, theme) => drawn(() => [draw(args, theme)]);
}

export function resultRenderer<K extends ToolName>(
  tool: K,
  body: (init: BodyInit<K>) => string[],
): ToolRenderers["renderResult"] {
  return (toolResult, options, theme) => {
    const result = detailsOf(toolResult, tool);
    const running = options.isPartial || result.status === "RUNNING";
    return drawn((width) => {
      const lines = body({
        after: result.after,
        expanded: options.expanded,
        result,
        running,
        theme,
        width,
      });
      return [
        headLine(theme, result),
        ...collapse(theme, lines, options.expanded),
        ...tailLines(theme, toolResult.content, result),
      ];
    });
  };
}

function evidenceRows(theme: Theme, result: ToolResult<unknown>): string[] {
  return (result.evidence ?? []).map((row) =>
    theme.fg("dim", `#${row.seq} ${row.event}`),
  );
}

function socialCall(args: unknown, theme: Theme): string {
  const to = argText(args, "to");
  const action = argText(args, "do") ?? (to ? "whisper" : "say");
  const text = argText(args, "text");
  const quoted = text === undefined ? undefined : `"${text}"`;
  return callLine({
    icon: to ? "whisper" : "say",
    parts: [action, to && `→ ${to}`, quoted],
    theme,
    verb: "social",
  });
}

function socialBody({
  after,
  result,
  theme,
  expanded,
}: BodyInit<"social">): string[] {
  if (!expanded) return [];
  const echo = after.confirmed
    ? "the server echo confirmed it"
    : "no server echo was seen";
  const system = after.systemLine
    ? [theme.fg("muted", `${glyph("system")} ${after.systemLine}`)]
    : [];
  return [theme.fg("dim", echo), ...system, ...evidenceRows(theme, result)];
}

function stopCall(args: unknown, theme: Theme): string {
  return callLine({
    icon: "runFailed",
    parts: [argText(args, "run") ?? "everything"],
    theme,
    verb: "stop",
  });
}

function stopBody({
  after,
  result,
  theme,
  expanded,
}: BodyInit<"stop">): string[] {
  if (!expanded) return [];
  const runs = after.stopped.map(
    (run) =>
      `${run.id} ${run.kind} ${run.status}${run.reason ? ` ${run.reason}` : ""}`,
  );
  const vitals = `HP ${after.self.hp}/${after.self.maxHp}`;
  const attackers = after.attackers.map((a) =>
    theme.fg("error", `${glyph("hostile")} ${a.name} ${a.ref}`),
  );
  return [...runs, vitals, ...attackers, ...evidenceRows(theme, result)];
}

export const socialRenderers: ToolRenderers = {
  renderCall: callRenderer(socialCall),
  renderResult: resultRenderer("social", socialBody),
};

export const stopRenderers: ToolRenderers = {
  renderCall: callRenderer(stopCall),
  renderResult: resultRenderer("stop", stopBody),
};
```

- [ ] **Run the tests and see them pass.**

```bash
mise test packages/harness/src/ui/renderers/registry.test.ts
mise test packages/harness/src/ui/renderers/line.test.ts
bun run tsc --noEmit -p packages/harness
mise lint
mise format
```

Expected: every test passes; `tsc`, `lint` and `format` exit 0.

- [ ] **Commit.**

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add packages/harness/src/ui/renderers/registry.ts \
  packages/harness/src/ui/renderers/registry.test.ts \
  packages/harness/src/ui/renderers/line.ts \
  packages/harness/src/ui/renderers/line.test.ts \
  packages/harness/test-support/render-fixture.ts
mise exec -- git commit -m "feat: Add tool renderer registry and line family" -m "Every tool needs a one-line call row and a status-coloured result that replays from details. The registry returns an empty set for families not built yet, so Pi falls back to the text."
```


---

## Task U6: picture family (`look`)

**Needs:** U5.

**Files**

- Create: `packages/harness/src/ui/renderers/picture.ts`
- Modify: `packages/harness/src/ui/renderers/registry.ts` (one import, the `look` value)
- Test: `packages/harness/src/ui/renderers/picture.test.ts`

**Interfaces**

- Consumes: `LookAfter` (`contract/details.ts`); `PoseView`, `SelfView`,
  `UnitView` (`contract/views.ts`); U5 helpers `BodyInit`, `callLine`,
  `callRenderer`, `resultRenderer`, `unitGlyph`, `unitLabel`; from
  `ui/draw.ts`: `argText`, `bar`, `COMPASS_GLYPH`, `chrome`, `FACING_GLYPH`,
  `glyph`, `healthTone`, `padLeft`, `padRight`, `RELATION_TONE`; `glyphs()`.
- Produces:

```ts
export const MAP_MIN_WIDTH = 112;
export const lookRenderers: ToolRenderers;
```

Collapsed (design E.1): 3 rows under the status line: vitals; place with
coordinates, facing and the `unchanged ×n` badge; the danger line or the
nearest hostile. Expanded: the unit rows (`ref`, glyph, name, level, HP,
distance and compass, `on you`, `loot`, `out of view`) and the match count;
at `MAP_MIN_WIDTH` columns or more, a 25 × 11 mini-map to the right, zoomed
to the nearest 10 units (radius rounded up to 5 yd, at least 10 yd; north
is up, WoW +x is north and +y is west).

**Steps**

- [ ] **Write the failing test.** `packages/harness/src/ui/renderers/picture.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { LookAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import { nerd } from "#harness/ui/glyphs";
import {
  closed,
  open,
  renderCallLine,
  renderResultLines,
} from "#test-support/render-fixture";
import {
  nowFixture,
  painted,
  plain,
  testTheme,
  unitFixture,
} from "#test-support/ui-fixture";

const theme = testTheme();
const now = nowFixture();
const stalker = unitFixture();
const vendor = unitFixture({
  attackable: false,
  attackingMe: false,
  compass: "E",
  distance: 18,
  name: "Innkeeper Delaniel",
  ref: "u3",
  relation: "friendly",
  roles: ["vendor", "innkeeper"],
  targetsMe: false,
  x: 8765,
  y: -6701,
});

const after: LookAfter = {
  danger: { attackers: now.attackers, hpPct: 81 },
  filter: "any",
  matched: 2,
  name: undefined,
  nearest: { hostile: stalker, vendor },
  place: now.place,
  rows: [stalker, vendor],
  run: undefined,
  seen: 9,
  self: now.self,
  target: stalker,
  unchanged: 0,
  within: undefined,
};

const result = (look: LookAfter): ToolResult<LookAfter> => ({
  after: look,
  body: [],
  detail: "2 units within 60 yd.",
  status: "DONE",
});

describe("picture family (look)", () => {
  test("call line shows the filter", () => {
    expect(
      renderCallLine("look", { find: "hostile", name: "Stalker", within: 30 }),
    ).toBe(`${nerd.target} look hostile "Stalker" ≤30y`);
  });

  test("collapsed: status, vitals, place and danger", () => {
    const lines = renderResultLines("look", result(after));
    const text = plain(lines);
    expect(text).toHaveLength(4);
    expect(text[0]).toBe(`${nerd.runDone} DONE 2 units within 60 yd.`);
    expect(text[1]).toContain("Fgklibhlflc L10 Priest");
    expect(text[2]).toBe(
      `${nerd.mapPin} Eversong Woods · Fairbreeze Village (8765,-6683) ${nerd.facingNE}`,
    );
    expect(text[3]).toBe(
      `${nerd.warning} Springpaw Stalker u9 attacking · 81% HP`,
    );
    expect(painted(theme, "error", lines[3] ?? "")).toBe(true);
  });

  test("without danger the third line names the nearest hostile", () => {
    const calm = { ...after, danger: { attackers: [], hpPct: 81 } };
    expect(plain(renderResultLines("look", result(calm)))[3]).toBe(
      `nearest hostile ${nerd.hostile} Springpaw Stalker u9 L7 4y${nerd.compassNE}`,
    );
  });

  test("the unchanged badge counts repeated looks", () => {
    expect(
      plain(renderResultLines("look", result({ ...after, unchanged: 3 })))[2],
    ).toContain(`${nerd.clock} unchanged ×3`);
  });

  test("expanded at 100 columns lists rows without a map", () => {
    const text = plain(
      renderResultLines("look", result(after), { options: open, width: 100 }),
    );
    expect(text[4]).toStartWith(`u9   ${nerd.hostile} Springpaw Stalker`);
    expect(text[5]).toStartWith(`u3   ${nerd.vendor} Innkeeper Delaniel`);
    expect(text[6]).toBe("2 of 9 units match any");
    expect(text.join("\n")).not.toContain("┌");
  });

  test("expanded at 140 columns draws the mini-map beside the rows", () => {
    const lines = renderResultLines("look", result(after), {
      options: open,
      width: 140,
    });
    const text = plain(lines).join("\n");
    expect(text).toContain("┌");
    expect(text).toContain(`${nerd.rangeRing} 20y`);
    expect(text).toContain(nerd.facingNE);
    for (const line of lines)
      expect(visibleWidth(line)).toBeLessThanOrEqual(140);
  });

  test("collapsed output stays within every width", () => {
    for (const width of [30, 60, 90]) {
      for (const line of renderResultLines("look", result(after), {
        options: closed,
        width,
      })) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
```

- [ ] **Run the test and see it fail.**

```bash
mise test packages/harness/src/ui/renderers/picture.test.ts
```

Expected: FAIL — `Error: no renderer for look` (thrown by `renderResultLines` while the registry holds `look: {}`).

- [ ] **Implement.** `packages/harness/src/ui/renderers/picture.ts`:

```ts
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { LookAfter } from "#harness/contract/details";
import type { PoseView, SelfView, UnitView } from "#harness/contract/views";
import { glyphs } from "#harness/ui/context";
import {
  argText,
  bar,
  COMPASS_GLYPH,
  chrome,
  FACING_GLYPH,
  glyph,
  healthTone,
  padLeft,
  padRight,
  RELATION_TONE,
} from "#harness/ui/draw";
import {
  type BodyInit,
  callLine,
  callRenderer,
  resultRenderer,
  unitGlyph,
  unitLabel,
} from "#harness/ui/renderers/line";
import type { ToolRenderers } from "#harness/ui/renderers/registry";

type Cell = { col: number; row: number };
type MapInit = {
  theme: Theme;
  pose: PoseView;
  units: readonly UnitView[];
  target: string | undefined;
};

export const MAP_MIN_WIDTH = 112;
const MAP_COLS = 25;
const MAP_ROWS = 11;
const MAP_UNITS = 10;

function vitalsLine(theme: Theme, self: SelfView): string {
  const g = glyphs();
  const hp = bar({
    cells: 12,
    max: self.maxHp,
    theme,
    tone: healthTone(self.hp / Math.max(1, self.maxHp)),
    value: self.hp,
  });
  const power =
    self.powerKind === "none"
      ? ""
      : ` ${g.mana} ${bar({ cells: 12, max: self.maxPower, theme, tone: "mdLink", value: self.power })} ${self.power}/${self.maxPower}`;
  return `${theme.bold(self.name)} ${theme.fg("muted", `L${self.level} ${self.className}`)}  ${g.health} ${hp} ${self.hp}/${self.maxHp}${power}`;
}

function placeLine(theme: Theme, after: LookAfter): string {
  const g = glyphs();
  const { zone, area } = after.place;
  const pose = after.self.pose;
  const where = pose
    ? ` (${Math.round(pose.x)},${Math.round(pose.y)}) ${g[FACING_GLYPH[pose.facing]]}`
    : "";
  const unchanged =
    after.unchanged > 1
      ? theme.fg("dim", ` ${g.clock} unchanged ×${after.unchanged}`)
      : "";
  const name =
    [zone, area]
      .filter((part) => part !== undefined)
      .join(` ${chrome().sep} `) || "unknown place";
  return `${theme.fg("accent", g.mapPin)} ${name}${theme.fg("dim", where)}${unchanged}`;
}

function distanceText(unit: UnitView): string {
  if (unit.distance === undefined) return "";
  const arrow = unit.compass ? glyph(COMPASS_GLYPH[unit.compass]) : "";
  return `${Math.round(unit.distance)}y${arrow}`;
}

function nearLine(theme: Theme, after: LookAfter): string {
  const first = after.danger.attackers[0];
  if (first) {
    const more =
      after.danger.attackers.length > 1
        ? ` and ${after.danger.attackers.length - 1} more`
        : "";
    return theme.fg(
      "error",
      `${glyph("warning")} ${first.name} ${first.ref}${more} attacking · ${after.danger.hpPct}% HP`,
    );
  }
  const hostile = after.nearest.hostile;
  if (!hostile)
    return theme.fg("success", `${glyph("friendly")} no hostile in view`);
  return `${theme.fg("muted", "nearest hostile")} ${unitLabel(theme, hostile)} L${hostile.level} ${distanceText(hostile)}`;
}

function unitRow(theme: Theme, unit: UnitView): string {
  const tone = unit.alive ? RELATION_TONE[unit.relation] : "dim";
  const name = theme.fg(tone, `${unitGlyph(unit)} ${padRight(unit.name, 22)}`);
  const hp = `${bar({ cells: 8, max: unit.maxHp, theme, tone: healthTone(unit.hpPct / 100), value: unit.hp })}${padLeft(`${unit.hpPct}%`, 5)}`;
  const tags = [
    unit.targetsMe ? theme.fg("error", `${glyph("target")} on you`) : "",
    unit.lootable ? theme.fg("warning", `${glyph("loot")} loot`) : "",
    unit.inView ? "" : theme.fg("dim", "out of view"),
  ];
  return `${padRight(unit.ref, 4)} ${name} ${padLeft(`L${unit.level}`, 3)} ${hp} ${padLeft(distanceText(unit), 5)} ${tags.filter(Boolean).join(" ")}`.trimEnd();
}

function mapRadius(units: readonly UnitView[]): number {
  const near = units.map((unit) => unit.distance ?? 0).slice(0, MAP_UNITS);
  return Math.max(10, Math.ceil(Math.max(0, ...near) / 5) * 5);
}

function mapCell(
  unit: UnitView,
  pose: PoseView,
  radius: number,
): Cell | undefined {
  if (unit.x === undefined || unit.y === undefined) return;
  const col = Math.round(
    (MAP_COLS - 1) / 2 - ((unit.y - pose.y) / radius) * (MAP_COLS / 2),
  );
  const row = Math.round(
    (MAP_ROWS - 1) / 2 - ((unit.x - pose.x) / radius) * (MAP_ROWS / 2),
  );
  return col >= 0 && col < MAP_COLS && row >= 0 && row < MAP_ROWS
    ? { col, row }
    : undefined;
}

function put(grid: string[][], cell: Cell, text: string): void {
  const line = grid[cell.row];
  if (line) line[cell.col] = text;
}

function miniMap({ theme, pose, units, target }: MapInit): string[] {
  const c = chrome();
  const radius = mapRadius(units);
  const grid = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, () => " "),
  );
  const centre = { col: (MAP_COLS - 1) / 2, row: (MAP_ROWS - 1) / 2 };
  for (const unit of [...units.slice(0, MAP_UNITS)].reverse()) {
    const cell = mapCell(unit, pose, radius);
    const tone = unit.ref === target ? "accent" : RELATION_TONE[unit.relation];
    if (cell) put(grid, cell, theme.fg(tone, unitGlyph(unit)));
  }
  put(grid, centre, theme.fg("accent", glyph(FACING_GLYPH[pose.facing])));
  const [tl, tr, bl, br] = c.corners;
  const label = ` ${glyph("rangeRing")} ${radius}y `;
  const top = theme.fg("borderMuted", `${tl}${c.hline.repeat(MAP_COLS)}${tr}`);
  const bottom = theme.fg(
    "borderMuted",
    `${bl}${label}${c.hline.repeat(Math.max(0, MAP_COLS - visibleWidth(label)))}${br}`,
  );
  const side = theme.fg("borderMuted", c.rule);
  return [
    top,
    ...grid.map((cells) => `${side}${cells.join("")}${side}`),
    bottom,
  ];
}

function besideMap(
  left: readonly string[],
  map: readonly string[],
  width: number,
): string[] {
  const leftWidth = width - MAP_COLS - 4;
  const height = Math.max(left.length, map.length);
  return Array.from(
    { length: height },
    (_, i) => `${padRight(left[i] ?? "", leftWidth)}  ${map[i] ?? ""}`,
  );
}

function lookBody({
  after,
  theme,
  expanded,
  width,
}: BodyInit<"look">): string[] {
  const head = [
    vitalsLine(theme, after.self),
    placeLine(theme, after),
    nearLine(theme, after),
  ];
  if (!expanded) return head;
  const rows = after.rows.map((unit) => unitRow(theme, unit));
  const count = theme.fg(
    "dim",
    `${after.matched} of ${after.seen} units match ${after.filter}`,
  );
  const left = [...head, ...rows, count];
  const pose = after.self.pose;
  if (!pose || width < MAP_MIN_WIDTH) return left;
  return besideMap(
    left,
    miniMap({ pose, target: after.target?.ref, theme, units: after.rows }),
    width,
  );
}

function lookCall(args: unknown, theme: Theme): string {
  const name = argText(args, "name");
  const within = argText(args, "within");
  const parts = [
    argText(args, "find") ?? "any",
    name && `"${name}"`,
    within && `≤${within}y`,
  ];
  return callLine({ icon: "target", parts, theme, verb: "look" });
}

export const lookRenderers: ToolRenderers = {
  renderCall: callRenderer(lookCall),
  renderResult: resultRenderer("look", lookBody),
};
```

- [ ] **Register the family.** In `packages/harness/src/ui/renderers/registry.ts` add

```ts
import { lookRenderers } from "#harness/ui/renderers/picture";
```

and replace these map values (the other keys stay as they are):

```ts
  look: lookRenderers,
```

- [ ] **Run the tests and see them pass.**

```bash
mise test packages/harness/src/ui/renderers/picture.test.ts
mise test packages/harness/src/ui/renderers/registry.test.ts
bun run tsc --noEmit -p packages/harness
mise lint
mise format
```

Expected: every test passes; `tsc`, `lint` and `format` exit 0.

- [ ] **Commit.**

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add packages/harness/src/ui/renderers/picture.ts \
  packages/harness/src/ui/renderers/picture.test.ts \
  packages/harness/src/ui/renderers/registry.ts
mise exec -- git commit -m "feat: Draw look results as a picture" -m "A look result is the human's main view of the field. Vitals, place and danger fit in three rows, and the expanded view adds the unit list and a mini-map on wide panes."
```


---

## Task U7: live-run family (`travel`, `engage`, `rest`, `recover`)

**Needs:** U5, U6 (both edit `renderers/registry.ts`).

**Files**

- Create: `packages/harness/src/ui/renderers/live-run.ts`
- Modify: `packages/harness/src/ui/renderers/registry.ts` (one import, four values)
- Test: `packages/harness/src/ui/renderers/live-run.test.ts`

**Interfaces**

- Consumes: `EngageAfter`, `JevDecisionView`, `LegView`, `TravelAfter`,
  `TravelGoalView`, `RestAfter`, `RecoverAfter` (`contract/details.ts`);
  `CastView`, `UnitView`, `VitalsView` (`contract/views.ts`); U5 helpers;
  from `ui/draw.ts`: `argText`, `bar`, `COMPASS_GLYPH`, `chrome`, `glyph`,
  `healthTone`, `money`, `seconds`, `span`; `glyphs()`.
- Produces:

```ts
export const travelRenderers: ToolRenderers;
export const engageRenderers: ToolRenderers;
export const restRenderers: ToolRenderers;
export const recoverRenderers: ToolRenderers;
```

Run tools stream partials (`isPartial`, status `RUNNING`), and only the
progress rows change (design E.1). `travel`: progress bar and yards while
running; goal, summary, floors tried, new units in view when done; legs
when expanded. `engage`: current target, own vitals, own cast, the Jev
action strip (last 40 decisions; a discarded one is dim), tally; expanded
adds targets, the last 6 decisions and the cast and swing error codes.
`rest`: health and mana bars, items used; expanded adds aura, items left,
time. `recover`: alive or still dead, via, time, legs, corpse distance;
expanded adds pose, HP and the other ways (design B.8).

**Steps**

- [ ] **Write the failing test.** `packages/harness/src/ui/renderers/live-run.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type {
  EngageAfter,
  RecoverAfter,
  RestAfter,
  TravelAfter,
} from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import { nerd } from "#harness/ui/glyphs";
import {
  open,
  partial,
  renderCallLine,
  renderResultLines,
} from "#test-support/render-fixture";
import {
  painted,
  plain,
  testTheme,
  unitFixture,
} from "#test-support/ui-fixture";

const theme = testTheme();
const vitals = {
  hp: 175,
  maxHp: 217,
  maxPower: 300,
  power: 212,
  powerKind: "mana" as const,
};

const travel: TravelAfter = {
  elapsedMs: 4200,
  floorRetried: false,
  floors: undefined,
  goal: { kind: "corpse" },
  legs: [{ index: 0, reason: undefined, status: "arrived", traveledYd: 23 }],
  newInView: [],
  pose: undefined,
  remainingYd: 34.3,
  totalYd: 57.3,
  traveledYd: 23,
};

const engage: EngageAfter = {
  cast: { elapsedMs: 400, spell: "Smite", totalMs: 1500 },
  castErrors: [{ code: 12, count: 2, word: "OUT_OF_RANGE" }],
  copper: 75,
  current: unitFixture(),
  decisions: [
    { at: 1, disposition: "applied", kind: "spell", label: "Smite" },
    { at: 2, disposition: "discarded", kind: "move", label: "step back" },
  ],
  how: "",
  kills: 1,
  loot: [{ count: 1, itemId: 2966, name: "Dragonhawk Egg", quality: 1 }],
  mode: "cycle",
  questId: undefined,
  self: vitals,
  swingErrors: [],
  targets: [
    {
      durationMs: 6000,
      name: "Springpaw Stalker",
      outcome: "killed",
      reason: undefined,
      ref: "u9",
      xp: 84,
    },
  ],
  timeouts: 0,
  wanted: 3,
  xp: 84,
};

const rest: RestAfter = {
  auraConfirmed: true,
  durationMs: 18_000,
  hpPct: 95,
  idle: false,
  itemsLeft: 4,
  manaPct: 91,
  used: [
    { count: 1, itemId: 159, name: "Refreshing Spring Water", quality: 1 },
  ],
};

const recover: RecoverAfter = {
  alive: true,
  alternatives: ["spirit_healer"],
  corpseYd: 0.8,
  durationMs: 41_000,
  hp: 108,
  legs: 3,
  maxHp: 217,
  pose: undefined,
  via: "corpse",
};

const done = <A>(after: A, detail: string): ToolResult<A> => ({
  after,
  body: [],
  detail,
  status: "DONE",
});

describe("live-run family", () => {
  test("call lines", () => {
    expect(renderCallLine("travel", { to: "corpse" })).toBe(
      `${nerd.route} travel → corpse`,
    );
    expect(
      renderCallLine("engage", { count: 3, target: "Springpaw Stalker" }),
    ).toBe(`${nerd.combat} engage Springpaw Stalker ×3`);
    expect(renderCallLine("rest", {})).toBe(`${nerd.idle} rest until 90%`);
    expect(renderCallLine("recover", {})).toBe(
      `${nerd.ghost} recover via corpse`,
    );
  });

  test("a running travel draws a progress bar and the run id", () => {
    const running: ToolResult<TravelAfter> = {
      ...done(travel, "walking to your corpse."),
      runId: "r4",
      status: "RUNNING",
    };
    const lines = renderResultLines("travel", running, { options: partial });
    const text = plain(lines);
    expect(text[0]).toBe(
      `${nerd.runRunning} RUNNING r4: walking to your corpse.`,
    );
    expect(text[1]).toContain("23y/57y · 34y left 4.2s");
    expect(text[2]).toBe(`${nerd.mapPin} corpse`);
    expect(painted(theme, "warning", lines[0] ?? "")).toBe(true);
  });

  test("a finished travel summarises the legs", () => {
    const text = plain(
      renderResultLines("travel", done(travel, "arrived at your corpse."), {
        options: open,
      }),
    );
    expect(text.slice(1)).toEqual([
      `${nerd.mapPin} corpse`,
      "walked 23y in 4.2s · 1 legs",
      "leg 1 arrived 23y",
    ]);
  });

  test("engage shows target, vitals, cast, the Jev strip and the tally", () => {
    const text = plain(
      renderResultLines("engage", done(engage, "killed 1 of 3.")),
    );
    expect(text).toHaveLength(6);
    expect(text[1]).toContain(`${nerd.hostile} Springpaw Stalker u9 L7`);
    expect(text[2]).toContain("175/217");
    expect(text[3]).toContain(`${nerd.cast} Smite`);
    expect(text[4]).toBe(
      `${nerd.jevDecision} Jev ${nerd.spell}${nerd.compassN}`,
    );
    expect(text[5]).toBe(
      `${nerd.kill} 1/3 · ${nerd.xp} +84 xp · ${nerd.loot} 1 items · ${nerd.copper}75`,
    );
  });

  test("expanded engage adds targets, decisions and error codes", () => {
    const text = plain(
      renderResultLines("engage", done(engage, "killed 1 of 3."), {
        options: open,
      }),
    );
    expect(text).toContain("u9 Springpaw Stalker killed 6s");
    expect(text).toContain("OUT_OF_RANGE (12) ×2");
  });

  test("rest and recover", () => {
    expect(
      plain(renderResultLines("rest", done(rest, "rested to 95%.")))[2],
    ).toBe("used Refreshing Spring Water ×1");
    const text = plain(
      renderResultLines("recover", done(recover, "you are alive."), {
        options: open,
      }),
    );
    expect(text[1]).toBe(
      `${nerd.spiritHealer} alive via corpse in 41s · 3 legs · ${nerd.corpse} 0.8y`,
    );
    expect(text).toContain("other ways: spirit_healer");
  });

  test("every live-run result fits a 40-column pane", () => {
    const all = [
      renderResultLines("travel", done(travel, "arrived."), {
        options: open,
        width: 40,
      }),
      renderResultLines("engage", done(engage, "killed 1 of 3."), {
        options: open,
        width: 40,
      }),
      renderResultLines("rest", done(rest, "rested."), {
        options: open,
        width: 40,
      }),
      renderResultLines("recover", done(recover, "alive."), {
        options: open,
        width: 40,
      }),
    ];
    for (const line of all.flat())
      expect(visibleWidth(line)).toBeLessThanOrEqual(40);
  });
});
```

- [ ] **Run the test and see it fail.**

```bash
mise test packages/harness/src/ui/renderers/live-run.test.ts
```

Expected: FAIL — `Error: no renderer for travel`.

- [ ] **Implement.** `packages/harness/src/ui/renderers/live-run.ts`:

```ts
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import type {
  EngageAfter,
  JevDecisionView,
  LegView,
  TravelAfter,
  TravelGoalView,
} from "#harness/contract/details";
import type { CastView, UnitView, VitalsView } from "#harness/contract/views";
import { glyphs } from "#harness/ui/context";
import {
  argText,
  bar,
  COMPASS_GLYPH,
  chrome,
  glyph,
  healthTone,
  money,
  seconds,
  span,
} from "#harness/ui/draw";
import type { GlyphName } from "#harness/ui/glyphs";
import {
  type BodyInit,
  callLine,
  callRenderer,
  resultRenderer,
  unitLabel,
} from "#harness/ui/renderers/line";
import type { ToolRenderers } from "#harness/ui/renderers/registry";

const STRIP_CELLS = 40;
const DECISION_ROWS = 6;

const DECISION: Readonly<
  Record<JevDecisionView["kind"], { icon: GlyphName; tone: ThemeColor }>
> = {
  attack: { icon: "sword", tone: "error" },
  face: { icon: "target", tone: "muted" },
  item: { icon: "item", tone: "success" },
  move: { icon: "compassN", tone: "mdLink" },
  spell: { icon: "spell", tone: "accent" },
  wait: { icon: "idle", tone: "dim" },
};

const LEG_TONE: Readonly<Record<LegView["status"], ThemeColor>> = {
  arrived: "success",
  cancelled: "warning",
  failed: "error",
  interrupted: "warning",
  refused: "error",
};

function yards(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)}y`;
}

function goalText(goal: TravelGoalView): string {
  switch (goal.kind) {
    case "unit":
      return `${goal.name} ${goal.ref}`;
    case "point":
      return `(${Math.round(goal.x)}, ${Math.round(goal.y)})`;
    case "explore":
      return goal.direction ? `explore ${goal.direction}` : "explore";
    case "unstick":
      return "unstick";
    default:
      return "corpse";
  }
}

function vitalsRow(theme: Theme, vitals: VitalsView): string {
  const g = glyphs();
  const hp = bar({
    cells: 12,
    max: vitals.maxHp,
    theme,
    tone: healthTone(vitals.hp / Math.max(1, vitals.maxHp)),
    value: vitals.hp,
  });
  const power =
    vitals.powerKind === "none"
      ? ""
      : `  ${g.mana} ${bar({ cells: 12, max: vitals.maxPower, theme, tone: "mdLink", value: vitals.power })} ${vitals.power}/${vitals.maxPower}`;
  return `${theme.fg("accent", g.self)} ${g.health} ${hp} ${vitals.hp}/${vitals.maxHp}${power}`;
}

function unitRow(theme: Theme, unit: UnitView | undefined): string {
  if (!unit) return theme.fg("dim", `${glyph("target")} no current target`);
  const hp = bar({
    cells: 12,
    max: unit.maxHp,
    theme,
    tone: healthTone(unit.hpPct / 100),
    value: unit.hp,
  });
  return `${unitLabel(theme, unit)} L${unit.level} ${hp} ${unit.hp}/${unit.maxHp}`;
}

function castRow(theme: Theme, cast: CastView | undefined): string[] {
  if (!cast) return [];
  const progress = bar({
    cells: 12,
    max: cast.totalMs,
    theme,
    tone: "warning",
    value: cast.elapsedMs,
  });
  return [
    `${theme.fg("warning", glyph("cast"))} ${cast.spell} ${progress} ${seconds(cast.elapsedMs)}/${seconds(cast.totalMs)}`,
  ];
}

function travelCall(args: unknown, theme: Theme): string {
  const within = argText(args, "within");
  return callLine({
    icon: "route",
    parts: [`→ ${argText(args, "to") ?? "?"}`, within && `within ${within}y`],
    theme,
    verb: "travel",
  });
}

function travelProgress(theme: Theme, after: TravelAfter): string {
  const walked = yards(after.traveledYd);
  const time = theme.fg("muted", seconds(after.elapsedMs));
  if (after.totalYd === undefined)
    return `${theme.fg("accent", glyph("route"))} ${walked} walked ${time}`;
  const progress = bar({
    cells: 20,
    max: after.totalYd,
    theme,
    tone: "accent",
    value: after.traveledYd,
  });
  const left =
    after.remainingYd === undefined
      ? ""
      : ` · ${yards(after.remainingYd)} left`;
  return `${theme.fg("accent", glyph("route"))} ${progress} ${walked}/${yards(after.totalYd)}${left} ${time}`;
}

function legRow(theme: Theme, leg: LegView): string {
  const why = leg.reason ? ` ${leg.reason}` : "";
  return `${theme.fg("dim", `leg ${leg.index + 1}`)} ${theme.fg(LEG_TONE[leg.status], leg.status)}${why} ${yards(leg.traveledYd)}`;
}

function travelBody({
  after,
  theme,
  running,
  expanded,
}: BodyInit<"travel">): string[] {
  const goal = `${glyph("mapPin")} ${goalText(after.goal)}`;
  if (running) return [travelProgress(theme, after), goal];
  const summary = `walked ${yards(after.traveledYd)} in ${seconds(after.elapsedMs)} · ${after.legs.length} legs`;
  const floors = after.floors
    ? [
        `floors ${after.floors.map((z) => z.toFixed(1)).join(", ")}${after.floorRetried ? " (retried)" : ""}`,
      ]
    : [];
  const seen =
    after.newInView.length > 0
      ? [
          `new in view: ${after.newInView.map((unit) => unitLabel(theme, unit)).join(", ")}`,
        ]
      : [];
  const legs = expanded ? after.legs.map((leg) => legRow(theme, leg)) : [];
  return [goal, summary, ...floors, ...seen, ...legs];
}

function engageCall(args: unknown, theme: Theme): string {
  const count = argText(args, "count");
  const quest = argText(args, "quest");
  const how = argText(args, "how");
  const parts = [
    argText(args, "target") ?? "nearest hostile",
    count && `×${count}`,
    quest && `quest ${quest}`,
    how && `"${how}"`,
  ];
  return callLine({ icon: "combat", parts, theme, verb: "engage" });
}

function strip(theme: Theme, decisions: readonly JevDecisionView[]): string {
  const g = glyphs();
  const cells = decisions.slice(-STRIP_CELLS).map((d) => {
    const { icon, tone } = DECISION[d.kind];
    return d.disposition === "discarded"
      ? theme.fg("dim", g[icon])
      : theme.fg(tone, g[icon]);
  });
  return `${theme.fg("muted", `${g.jevDecision} Jev`)} ${cells.join("")}`;
}

function tally(theme: Theme, after: EngageAfter): string {
  const g = glyphs();
  const kills = `${g.kill} ${after.kills}/${after.wanted}`;
  const loot =
    after.loot.length > 0 ? ` · ${g.loot} ${after.loot.length} items` : "";
  const coins = after.copper > 0 ? ` · ${money(theme, after.copper)}` : "";
  return `${kills} · ${theme.fg("success", `${g.xp} +${after.xp} xp`)}${loot}${coins}`;
}

function targetLine(t: EngageAfter["targets"][number]): string {
  const why = t.reason ? ` ${t.reason}` : "";
  const time = t.durationMs === undefined ? "" : ` ${span(t.durationMs)}`;
  return `${t.ref} ${t.name} ${t.outcome}${why}${time}`;
}

function engageDetail(theme: Theme, after: EngageAfter): string[] {
  const targets = after.targets.map(targetLine);
  const decisions = after.decisions
    .slice(-DECISION_ROWS)
    .map((d) =>
      theme.fg(
        "dim",
        `${glyph(DECISION[d.kind].icon)} ${d.label} ${d.disposition}`,
      ),
    );
  const errors = [...after.castErrors, ...after.swingErrors].map((e) =>
    theme.fg("warning", `${e.word} (${e.code}) ×${e.count}`),
  );
  const timeouts =
    after.timeouts > 0
      ? [theme.fg("warning", `Jev timeouts ${after.timeouts}`)]
      : [];
  return [...targets, ...decisions, ...errors, ...timeouts];
}

function engageBody({ after, theme, expanded }: BodyInit<"engage">): string[] {
  const rows = [
    unitRow(theme, after.current),
    vitalsRow(theme, after.self),
    ...castRow(theme, after.cast),
    strip(theme, after.decisions),
    tally(theme, after),
  ];
  return expanded ? [...rows, ...engageDetail(theme, after)] : rows;
}

function restCall(args: unknown, theme: Theme): string {
  return callLine({
    icon: "idle",
    parts: [`until ${argText(args, "until") ?? "90"}%`],
    theme,
    verb: "rest",
  });
}

function restBody({ after, theme, expanded }: BodyInit<"rest">): string[] {
  const g = glyphs();
  const hp = `${g.health} ${bar({ cells: 12, max: 100, theme, tone: healthTone(after.hpPct / 100), value: after.hpPct })} ${after.hpPct}%`;
  const mana =
    after.manaPct === undefined
      ? ""
      : `  ${g.mana} ${bar({ cells: 12, max: 100, theme, tone: "mdLink", value: after.manaPct })} ${after.manaPct}%`;
  const used =
    after.used.length > 0
      ? `used ${after.used.map((item) => `${item.name} ×${item.count}`).join(", ")}`
      : "no food or drink used";
  const more = [
    `aura seen: ${after.auraConfirmed ? "yes" : "no"}`,
    `items left: ${after.itemsLeft}`,
    `time: ${seconds(after.durationMs)}`,
  ];
  return [`${hp}${mana}`, used, ...(expanded ? more : [])];
}

function recoverCall(args: unknown, theme: Theme): string {
  return callLine({
    icon: "ghost",
    parts: [`via ${argText(args, "how") ?? "corpse"}`],
    theme,
    verb: "recover",
  });
}

function recoverBody({
  after,
  theme,
  expanded,
}: BodyInit<"recover">): string[] {
  const g = glyphs();
  const state = after.alive
    ? theme.fg("success", `${g.spiritHealer} alive`)
    : theme.fg("error", `${g.ghost} still dead`);
  const corpse =
    after.corpseYd === undefined
      ? ""
      : ` · ${g.corpse} ${yards(after.corpseYd)}`;
  const head = `${state} via ${after.via} in ${seconds(after.durationMs)} · ${after.legs} legs${corpse}`;
  if (!expanded) return [head];
  const pose = after.pose
    ? [
        `at (${Math.round(after.pose.x)},${Math.round(after.pose.y)}) ${g[COMPASS_GLYPH[after.pose.facing]]}`,
      ]
    : [];
  const hp =
    after.hp === undefined || after.maxHp === undefined
      ? []
      : [`HP ${after.hp}/${after.maxHp}`];
  const other =
    after.alternatives.length > 0
      ? [`other ways: ${after.alternatives.join(` ${chrome().sep} `)}`]
      : [];
  return [head, ...pose, ...hp, ...other];
}

export const travelRenderers: ToolRenderers = {
  renderCall: callRenderer(travelCall),
  renderResult: resultRenderer("travel", travelBody),
};

export const engageRenderers: ToolRenderers = {
  renderCall: callRenderer(engageCall),
  renderResult: resultRenderer("engage", engageBody),
};

export const restRenderers: ToolRenderers = {
  renderCall: callRenderer(restCall),
  renderResult: resultRenderer("rest", restBody),
};

export const recoverRenderers: ToolRenderers = {
  renderCall: callRenderer(recoverCall),
  renderResult: resultRenderer("recover", recoverBody),
};
```

- [ ] **Register the family.** In `packages/harness/src/ui/renderers/registry.ts` add

```ts
import {
  engageRenderers,
  recoverRenderers,
  restRenderers,
  travelRenderers,
} from "#harness/ui/renderers/live-run";
```

and replace these map values (the other keys stay as they are):

```ts
  engage: engageRenderers,
  recover: recoverRenderers,
  rest: restRenderers,
  travel: travelRenderers,
```

- [ ] **Run the tests and see them pass.**

```bash
mise test packages/harness/src/ui/renderers/live-run.test.ts
mise test packages/harness/src/ui/renderers/registry.test.ts
bun run tsc --noEmit -p packages/harness
mise lint
mise format
```

Expected: every test passes; `tsc`, `lint` and `format` exit 0.

- [ ] **Commit.**

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add packages/harness/src/ui/renderers/live-run.ts \
  packages/harness/src/ui/renderers/live-run.test.ts \
  packages/harness/src/ui/renderers/registry.ts
mise exec -- git commit -m "feat: Draw live runs for travel, engage, rest" -m "Run tools stream partial results for up to two minutes. Progress bars, the Jev action strip and a final outcome line let the human follow a run without reading JSON."
```


---

## Task U8: card family (`interact`, `loot`, `journal`)

**Needs:** U5, U7 (both edit `renderers/registry.ts`).

**Files**

- Create: `packages/harness/src/ui/renderers/card.ts`
- Modify: `packages/harness/src/ui/renderers/registry.ts` (one import, three values)
- Test: `packages/harness/src/ui/renderers/card.test.ts`

**Interfaces**

- Consumes: `BagsView`, `InteractAfter`, `JournalAfter`, `LootLine`,
  `QuestLine`, `QuestOffer`, `LootAfter` (`contract/details.ts`);
  `GameLogEntry` (`contract/log.ts`); U5 helpers; from `ui/draw.ts`:
  `argText`, `entryGlyph`, `entryTone`, `glyph`, `hms`, `money`,
  `qualityTone`; `glyphs()`.
- Produces:

```ts
export const interactRenderers: ToolRenderers;
export const lootRenderers: ToolRenderers;
export const journalRenderers: ToolRenderers;
```

`interact`: NPC line with roles, then offers (quest glyph by state), gossip,
reward choices, stock with prices, trainer spells, bought, sold, learned,
repair cost, and the `Last:` money line. `loot`: corpse, items in quality
colour, coins, free bag slots, a warning when the loot window stayed open.
`journal`: quests as a tracker with turn-in hints; bags; spells; log as a
timeline with the range label and `+<n> more`. Log rows use absolute
`HH:MM:SS`, because a renderer that replays later must not show a wrong age.

**Steps**

- [ ] **Write the failing test.** `packages/harness/src/ui/renderers/card.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type {
  InteractAfter,
  JournalAfter,
  LootAfter,
} from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import { hms } from "#harness/ui/draw";
import { nerd } from "#harness/ui/glyphs";
import {
  open,
  renderCallLine,
  renderResultLines,
} from "#test-support/render-fixture";
import {
  painted,
  plain,
  testTheme,
  unitFixture,
} from "#test-support/ui-fixture";

const theme = testTheme();
const npc = unitFixture({
  name: "Magistrix Erona",
  ref: "u3",
  relation: "friendly",
  roles: ["questgiver"],
  targetsMe: false,
});

const talk: InteractAfter = {
  action: "talk",
  bought: undefined,
  dialogOpened: true,
  freeSlots: 11,
  gossip: [],
  learned: [],
  money: { after: 4975, before: 5075 },
  npc,
  offers: [
    {
      id: 8325,
      level: 1,
      line: 1,
      state: "available",
      title: "Reclaiming Sunstrider Isle",
    },
    {
      id: 8326,
      level: 2,
      line: 2,
      state: "ready",
      title: "Unfortunate Measures",
    },
  ],
  repairCost: undefined,
  rewardChoices: [],
  roles: ["questgiver"],
  sold: [],
  spells: [],
  stock: [],
};

const looted: LootAfter = {
  copper: 75,
  corpse: unitFixture({ alive: false, lootable: true }),
  freeSlots: 10,
  items: [
    { count: 1, itemId: 2966, name: "Dragonhawk Egg", quality: 1 },
    { count: 1, itemId: 20_797, name: "Lynx Collar", quality: 2 },
  ],
  windowClosed: true,
};

const at = new Date(2026, 8, 26, 19, 20, 11).getTime();

const log: JournalAfter = {
  about: "log",
  label: "since r4 started (1m 12s ago)",
  more: 3,
  rows: [
    {
      char: "Fgklibhlflc",
      class: "wake",
      data: {},
      domain: "life",
      event: "life/dead",
      seq: 90,
      text: "You died › Springpaw Stalker L7",
      ts: at,
      v: 1,
    },
  ],
};

const quests: JournalAfter = {
  about: "quests",
  quests: [
    {
      id: 8326,
      level: 2,
      objectives: [{ count: 8, required: 8, text: "Mana Wyrm slain" }],
      status: "complete",
      title: "Unfortunate Measures",
      turnIn: "Magistrix Erona",
    },
    {
      id: 8325,
      level: 1,
      objectives: [{ count: 3, required: 8, text: "Springpaw Cub slain" }],
      status: "incomplete",
      title: "Reclaiming Sunstrider Isle",
      turnIn: undefined,
    },
  ],
};

const done = <A>(after: A, detail: string): ToolResult<A> => ({
  after,
  body: [],
  detail,
  status: "DONE",
});

describe("card family", () => {
  test("call lines", () => {
    expect(
      renderCallLine("interact", { do: "turn_in", npc: "u3", what: "2" }),
    ).toBe(`${nerd.questgiver} interact u3 turn_in 2`);
    expect(renderCallLine("loot", {})).toBe(`${nerd.loot} loot nearest corpse`);
    expect(renderCallLine("journal", { about: "log", since: "r4" })).toBe(
      `${nerd.questLog} journal log r4`,
    );
  });

  test("interact talk lists offers and the Last money line", () => {
    const text = plain(
      renderResultLines(
        "interact",
        done(talk, "Magistrix Erona offers 2 quests."),
        { options: open },
      ),
    );
    expect(text[1]).toBe(`${nerd.questgiver} Magistrix Erona u3 questgiver`);
    expect(text[2]).toBe(
      `${nerd.questAvailable} 1. Reclaiming Sunstrider Isle [1]`,
    );
    expect(text[3]).toBe(`${nerd.questComplete} 2. Unfortunate Measures [2]`);
    expect(text[4]).toBe(
      `Last: ${nerd.silver}49 ${nerd.copper}75 (-${nerd.silver}1 ${nerd.copper}0)`,
    );
  });

  test("loot paints items in their quality colour", () => {
    const lines = renderResultLines(
      "loot",
      done(looted, "looted 2 items and 75 copper."),
    );
    expect(plain(lines)[1]).toBe(`${nerd.lootable} Springpaw Stalker u9`);
    expect(plain(lines)[2]).toBe(`${nerd.loot} Dragonhawk Egg ×1`);
    expect(painted(theme, "success", lines[3] ?? "")).toBe(true);
  });

  test("journal log shows the range label, timeline rows and the rest count", () => {
    const text = plain(renderResultLines("journal", done(log, "1 row.")));
    expect(text.slice(1)).toEqual([
      "since r4 started (1m 12s ago)",
      `${hms(at)} ${nerd.death} You died › Springpaw Stalker L7`,
      "+3 more",
    ]);
  });

  test("journal quests is a tracker with turn-in hints", () => {
    const text = plain(
      renderResultLines("journal", done(quests, "2 quests."), {
        options: open,
      }),
    );
    expect(text[1]).toBe(
      `${nerd.questComplete} Unfortunate Measures [2] → ${nerd.questgiver} Magistrix Erona`,
    );
    expect(text[4]).toBe("  3/8 Springpaw Cub slain");
  });

  test("card results fit a 40-column pane", () => {
    const all = [
      renderResultLines("interact", done(talk, "x"), {
        options: open,
        width: 40,
      }),
      renderResultLines("journal", done(quests, "x"), {
        options: open,
        width: 40,
      }),
    ];
    for (const line of all.flat())
      expect(visibleWidth(line)).toBeLessThanOrEqual(40);
  });
});
```

- [ ] **Run the test and see it fail.**

```bash
mise test packages/harness/src/ui/renderers/card.test.ts
```

Expected: FAIL — `Error: no renderer for interact`.

- [ ] **Implement.** `packages/harness/src/ui/renderers/card.ts`:

```ts
import type { Theme } from "@earendil-works/pi-coding-agent";
import type {
  BagsView,
  InteractAfter,
  JournalAfter,
  LootLine,
  QuestLine,
  QuestOffer,
} from "#harness/contract/details";
import type { GameLogEntry } from "#harness/contract/log";
import { glyphs } from "#harness/ui/context";
import {
  argText,
  entryGlyph,
  entryTone,
  glyph,
  hms,
  money,
  qualityTone,
} from "#harness/ui/draw";
import type { GlyphName } from "#harness/ui/glyphs";
import {
  type BodyInit,
  callLine,
  callRenderer,
  resultRenderer,
  unitLabel,
} from "#harness/ui/renderers/line";
import type { ToolRenderers } from "#harness/ui/renderers/registry";

const OFFER_GLYPH: Readonly<Record<QuestOffer["state"], GlyphName>> = {
  available: "questAvailable",
  incomplete: "questInProgress",
  ready: "questComplete",
};

const QUEST_GLYPH: Readonly<Record<QuestLine["status"], GlyphName>> = {
  complete: "questComplete",
  failed: "questFailed",
  incomplete: "questInProgress",
};

function itemText(theme: Theme, item: LootLine): string {
  return theme.fg(qualityTone(item.quality), `${item.name} ×${item.count}`);
}

function signed(theme: Theme, before: number, after: number): string {
  const delta = after - before;
  return `${delta < 0 ? "-" : "+"}${money(theme, Math.abs(delta))}`;
}

function offerRows(after: InteractAfter): string[] {
  const g = glyphs();
  const offers = after.offers.map(
    (o) =>
      `${g[OFFER_GLYPH[o.state]]} ${o.line}. ${o.title}${o.level === undefined ? "" : ` [${o.level}]`}`,
  );
  const gossip = after.gossip.map(
    (line) => `${g.say} ${line.line}. ${line.text}`,
  );
  const choices = after.rewardChoices.map(
    (choice) =>
      `${g.item} reward ${choice.index}. ${choice.name} ×${choice.count}`,
  );
  return [...offers, ...gossip, ...choices];
}

function shopRows(theme: Theme, after: InteractAfter): string[] {
  const g = glyphs();
  const stock = after.stock.map(
    (s) =>
      `${g.vendor} ${s.line}. ${s.name} ×${s.stack} ${money(theme, s.price)}`,
  );
  const spells = after.spells.map(
    (s) =>
      `${g.trainer} ${s.name}${s.rank ? ` (${s.rank})` : ""} L${s.level} ${money(theme, s.cost)} ${s.state}`,
  );
  const bought = after.bought
    ? [`bought ${itemText(theme, after.bought)}`]
    : [];
  const sold =
    after.sold.length > 0
      ? [`sold ${after.sold.map((item) => itemText(theme, item)).join(", ")}`]
      : [];
  const learned =
    after.learned.length > 0 ? [`learned ${after.learned.join(", ")}`] : [];
  const repair =
    after.repairCost === undefined
      ? []
      : [`repair ${money(theme, after.repairCost)}`];
  return [...stock, ...spells, ...bought, ...sold, ...learned, ...repair];
}

function interactBody({ after, theme }: BodyInit<"interact">): string[] {
  const roles =
    after.roles.length > 0 ? theme.fg("dim", ` ${after.roles.join(", ")}`) : "";
  const last = after.money
    ? [
        theme.fg(
          "muted",
          `Last: ${money(theme, after.money.after)} (${signed(theme, after.money.before, after.money.after)})`,
        ),
      ]
    : [];
  return [
    `${unitLabel(theme, after.npc)}${roles}`,
    ...offerRows(after),
    ...shopRows(theme, after),
    ...last,
  ];
}

function interactCall(args: unknown, theme: Theme): string {
  const parts = [
    argText(args, "npc") ?? "?",
    argText(args, "do") ?? "talk",
    argText(args, "what"),
  ];
  return callLine({ icon: "questgiver", parts, theme, verb: "interact" });
}

function lootBody({ after, theme }: BodyInit<"loot">): string[] {
  const g = glyphs();
  const corpse = after.corpse
    ? unitLabel(theme, after.corpse)
    : theme.fg("dim", `${g.corpse} corpse`);
  const items = after.items.map((item) => `${g.loot} ${itemText(theme, item)}`);
  const coins = after.copper > 0 ? [money(theme, after.copper)] : [];
  const bag =
    after.freeSlots === undefined
      ? []
      : [theme.fg("muted", `${g.bag} ${after.freeSlots} free`)];
  const open = after.windowClosed
    ? []
    : [theme.fg("warning", `${g.warning} the loot window is still open`)];
  return [corpse, ...items, ...coins, ...bag, ...open];
}

function lootCall(args: unknown, theme: Theme): string {
  return callLine({
    icon: "loot",
    parts: [argText(args, "target") ?? "nearest corpse"],
    theme,
    verb: "loot",
  });
}

function questRows(theme: Theme, quests: readonly QuestLine[]): string[] {
  const g = glyphs();
  return quests.flatMap((q) => {
    const icon = theme.fg(
      q.status === "complete" ? "success" : "warning",
      g[QUEST_GLYPH[q.status]],
    );
    const head = `${icon} ${q.title}${q.level === undefined ? "" : ` [${q.level}]`}`;
    const turnIn =
      q.status === "complete" && q.turnIn
        ? theme.fg("success", ` → ${g.questgiver} ${q.turnIn}`)
        : "";
    const goals = q.objectives.map((o) =>
      theme.fg(
        o.count >= o.required ? "dim" : "text",
        `  ${o.count}/${o.required} ${o.text}`,
      ),
    );
    return [`${head}${turnIn}`, ...goals];
  });
}

function bagRows(theme: Theme, bags: BagsView): string[] {
  const g = glyphs();
  const purse = [
    bags.copper === undefined ? "" : money(theme, bags.copper),
    bags.freeSlots === undefined ? "" : `${g.bag} ${bags.freeSlots} free`,
  ];
  const worn = bags.equipped.map(
    (e) =>
      `${theme.fg("dim", e.slot)} ${theme.fg(qualityTone(e.quality), e.name)}`,
  );
  const items = bags.items.map(
    (item) =>
      `${g.item} ${theme.fg(qualityTone(item.quality), `${item.name} ×${item.count}`)} ${theme.fg("dim", item.kind)}`,
  );
  return [purse.filter(Boolean).join("  "), ...items, ...worn];
}

function logRow(theme: Theme, entry: GameLogEntry): string {
  const tone = entryTone(entry);
  return `${theme.fg("dim", hms(entry.ts))} ${theme.fg(tone, entryGlyph(entry))} ${theme.fg(tone, entry.text)}`;
}

function journalRows(theme: Theme, after: JournalAfter): string[] {
  switch (after.about) {
    case "quests":
      return questRows(theme, after.quests);
    case "bags":
      return bagRows(theme, after.bags);
    case "spells":
      return after.spells.map(
        (s) => `${glyph("spell")} ${s.name}${s.rank ? ` (${s.rank})` : ""}`,
      );
    default: {
      const more =
        after.more > 0 ? [theme.fg("dim", `+${after.more} more`)] : [];
      return [
        theme.fg("muted", after.label),
        ...after.rows.map((entry) => logRow(theme, entry)),
        ...more,
      ];
    }
  }
}

function journalBody({ after, theme }: BodyInit<"journal">): string[] {
  return journalRows(theme, after);
}

function journalCall(args: unknown, theme: Theme): string {
  const find = argText(args, "find");
  const parts = [
    argText(args, "about") ?? "?",
    find && `"${find}"`,
    argText(args, "since"),
  ];
  return callLine({ icon: "questLog", parts, theme, verb: "journal" });
}

export const interactRenderers: ToolRenderers = {
  renderCall: callRenderer(interactCall),
  renderResult: resultRenderer("interact", interactBody),
};

export const lootRenderers: ToolRenderers = {
  renderCall: callRenderer(lootCall),
  renderResult: resultRenderer("loot", lootBody),
};

export const journalRenderers: ToolRenderers = {
  renderCall: callRenderer(journalCall),
  renderResult: resultRenderer("journal", journalBody),
};
```

- [ ] **Register the family.** In `packages/harness/src/ui/renderers/registry.ts` add

```ts
import {
  interactRenderers,
  journalRenderers,
  lootRenderers,
} from "#harness/ui/renderers/card";
```

and replace these map values (the other keys stay as they are):

```ts
  interact: interactRenderers,
  journal: journalRenderers,
  loot: lootRenderers,
```

- [ ] **Run the tests and see them pass.**

```bash
mise test packages/harness/src/ui/renderers/card.test.ts
mise test packages/harness/src/ui/renderers/registry.test.ts
bun run tsc --noEmit -p packages/harness
mise lint
mise format
```

Expected: every test passes; `tsc`, `lint` and `format` exit 0.

- [ ] **Commit.**

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add packages/harness/src/ui/renderers/card.ts \
  packages/harness/src/ui/renderers/card.test.ts \
  packages/harness/src/ui/renderers/registry.ts
mise exec -- git commit -m "feat: Draw interact, loot and journal cards" -m "Quest offers, vendor stock, loot and the quest log are lists that the human scans. Cards with quest glyphs, quality colours and coin glyphs make them quick to read."
```


---

## Task U10: human slash commands

**Needs:** U1c, F5a (`createTestRuntime`), F7a (`extension.ts`), F7b
(`humanStop`), L2 (`queryLog`), U11a (it lands `installUi` in `extension.ts` first).

**Files**

- Create: `packages/harness/src/extension/commands.ts`
- Modify: `packages/harness/src/extension/extension.ts` (insertion point: one import line and one call line, contract 2.5)
- Test: `packages/harness/src/extension/commands.test.ts`

**Interfaces**

- Consumes: `HarnessRuntime` (`contract/services.ts`; members `log`,
  `runs`, `clock`, `session`, `handle`, `mutex`, `connection`, `connect`,
  `disconnect`, `snapshots`); `humanStop(init: { rt: HarnessRuntime; via: "reflex" | "command" | "key"; text: string }): RunRecord[]`
  (F7b); `queryLog(init: { log: GameLog; runs: RunRegistry; turnStartSeq: number; now: number; query: LogQuery }): LogPage`
  (L2); `messageOf(error: unknown, fallback?: string): string`
  (`@tuicraft/core/lib/errors`); `WorldHandle.sendSay`, `sendWhisper`,
  `sendParty`, `sendGuild` (`@tuicraft/core`); `ExtensionAPI`,
  `ExtensionCommandContext`, `RegisteredCommand`; test:
  `createTestRuntime(init?: TestRuntimeInit): Promise<TestRuntime>` (F5a),
  `createPiRecorder`, `createUiRecorder`, `recorderContext` (U1c).
- Produces:

```ts
export const LOG_COMMAND_ROWS = 20;
export const OFFLINE_TEXT = "The game connection is down. Run /connect.";
export function installCommands(pi: ExtensionAPI, rt: HarnessRuntime): void;
```

The log rows use the found plan's `humanStop` row shape
(`{ text, via, stopReflex, stoppedRuns }`, contract issue 7). `/log` adds up
to 20 `wow-human` entries, and Pi draws a spacer row before each custom
entry, so one `/log` takes about 40 transcript rows; that is expected for a
human command.

Commands (design E.3, contract 2.14): `/now`, `/log [filter]`, `/stop`,
`/connect`, `/disconnect`, `/say <text>`, `/w <name> <text>`, `/p <text>`,
`/g <text>`, `/wake on|off`, `/snapshot [label]`. Chat commands send inside
`rt.mutex.run` (design H.9). Each command except `/stop` appends its own
`human/input` row, because Pi runs extension commands before the `input`
event (contract issue 7); for `/stop`, F7b's `humanStop` appends the row
with the stopped run ids in `stoppedRuns`. `/log` passes
`turnStartSeq: 0`, so the default `since` covers the whole log, and shows
the rows as `wow-human` entries. `/now` uses `notify` (contract issue 8).
Feedback goes through `ctx.ui.notify`, never to the model.

**Steps**

- [ ] **Write the failing test.** `packages/harness/src/extension/commands.test.ts`:

```ts
import { describe, expect, jest, test } from "bun:test";
import type { GameLogEntry } from "#harness/contract/log";
import type { RunEnd } from "#harness/contract/runs";
import type { HarnessRuntime } from "#harness/contract/services";
import {
  installCommands,
  LOG_COMMAND_ROWS,
  OFFLINE_TEXT,
} from "#harness/extension/commands";
import {
  createPiRecorder,
  createUiRecorder,
  recorderContext,
} from "#test-support/pi-recorder";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function setup() {
  const runtime = await createTestRuntime();
  const fake = createPiRecorder();
  installCommands(fake.pi, runtime.rt);
  const { ui, named } = createUiRecorder();
  const ctx = recorderContext({ ui });
  const run = (name: string, args = "") => fake.run(name, args, ctx);
  return { ...runtime, fake, named, run };
}

function inputs(rt: HarnessRuntime): GameLogEntry[] {
  return rt.log.recent(100).filter((entry) => entry.event === "human/input");
}

function waitForAbort(signal: AbortSignal): Promise<RunEnd<undefined>> {
  return new Promise((resolve) => {
    signal.addEventListener("abort", () =>
      resolve({
        reason: "human_stop",
        status: "cancelled",
        summary: "stopped",
        value: undefined,
      }),
    );
  });
}

describe("installCommands", () => {
  test("registers the eleven human commands", async () => {
    const { fake } = await setup();
    expect([...fake.commands.keys()].sort()).toEqual([
      "connect",
      "disconnect",
      "g",
      "log",
      "now",
      "p",
      "say",
      "snapshot",
      "stop",
      "w",
      "wake",
    ]);
  });

  test("/say, /p and /g send through the world mutex and log the input", async () => {
    const { rt, handle, run } = await setup();
    const mutex = jest.spyOn(rt.mutex, "run");
    await run("say", "hello there");
    await run("p", "omw");
    await run("g", "gz");
    expect(handle.sendSay).toHaveBeenCalledWith("hello there");
    expect(handle.sendParty).toHaveBeenCalledWith("omw");
    expect(handle.sendGuild).toHaveBeenCalledWith("gz");
    expect(mutex).toHaveBeenCalledTimes(3);
    expect(inputs(rt).map((entry) => entry.data)).toEqual([
      {
        stoppedRuns: [],
        stopReflex: false,
        text: "/say hello there",
        via: "command",
      },
      { stoppedRuns: [], stopReflex: false, text: "/p omw", via: "command" },
      { stoppedRuns: [], stopReflex: false, text: "/g gz", via: "command" },
    ]);
  });

  test("/w splits the name from the text", async () => {
    const { handle, run, named } = await setup();
    await run("w", "Kaelyn level 10, you?");
    expect(handle.sendWhisper).toHaveBeenCalledWith("Kaelyn", "level 10, you?");
    await run("w", "Kaelyn");
    expect(named("notify").at(-1)).toEqual([
      "Use /w <name> <text>.",
      "warning",
    ]);
  });

  test("chat commands refuse when the connection is down", async () => {
    const { rt, handle, run, named } = await setup();
    rt.handle = () => undefined;
    await run("say", "hello");
    expect(handle.sendSay).not.toHaveBeenCalled();
    expect(named("notify")).toEqual([[OFFLINE_TEXT, "error"]]);
  });

  test("/stop stops the active run; humanStop logs it once", async () => {
    const { rt, run, named } = await setup();
    rt.runs.start({
      args: {},
      kind: "engage",
      launch: ({ signal }) => waitForAbort(signal),
      toolCallId: "call-1",
    });
    await run("stop");
    expect(named("notify")).toEqual([["Stopped r1 (engage).", "info"]]);
    expect(inputs(rt)).toHaveLength(1);
    expect(inputs(rt)[0]?.data).toMatchObject({
      stoppedRuns: ["r1"],
      text: "/stop",
      via: "command",
    });
  });

  test("/wake sets the session flag", async () => {
    const { rt, run, named } = await setup();
    await run("wake", "off");
    expect(rt.session.wake).toBe(false);
    await run("wake", "maybe");
    expect(named("notify")).toEqual([
      ["Wake is off.", "info"],
      ["Use /wake on or /wake off.", "warning"],
    ]);
  });

  test("/now prints the last [now] line the model got", async () => {
    const { rt, run, named } = await setup();
    await run("now");
    rt.session.lastNow = "[now 19:13:02] Testchar L10 Priest HP 175/217";
    await run("now");
    expect(named("notify")).toEqual([
      ["No [now] line was sent to the model yet.", "info"],
      ["[now 19:13:02] Testchar L10 Priest HP 175/217", "info"],
    ]);
  });

  test("/log shows up to 20 rows as human-only lines", async () => {
    const { rt, fake, run } = await setup();
    for (let i = 0; i < 25; i += 1)
      rt.log.append({
        class: "log",
        data: {},
        domain: "xp",
        event: "xp/gain",
        text: `xp ${i}`,
      });
    await run("log");
    const rows = fake.entries.filter(
      (entry) => entry.customType === "wow-human",
    );
    expect(rows).toHaveLength(LOG_COMMAND_ROWS);
  });

  test("/snapshot writes a labelled snapshot", async () => {
    const { rt, run, named } = await setup();
    const write = jest.spyOn(rt.snapshots, "write");
    await run("snapshot", "Before Pull!");
    expect(write).toHaveBeenCalledWith("before-pull-");
    expect(named("notify").at(-1)?.[1]).toBe("info");
  });

  test("/connect and /disconnect report the result", async () => {
    const { rt, run, named } = await setup();
    await run("connect");
    rt.disconnect = jest.fn(async () => undefined);
    await run("disconnect");
    rt.connection = () => "offline";
    rt.connect = () => Promise.reject(new Error("auth failed"));
    await run("connect");
    expect(rt.disconnect).toHaveBeenCalledTimes(1);
    expect(named("notify")).toEqual([
      ["The game connection is already up.", "info"],
      ["Disconnected. Run /connect to log in again.", "info"],
      ["Connect failed: auth failed", "error"],
    ]);
  });
});
```

- [ ] **Run the test and see it fail.**

```bash
mise test packages/harness/src/extension/commands.test.ts
```

Expected: FAIL — error: Cannot find module "#harness/extension/commands" from ".../src/extension/commands.test.ts".

- [ ] **Implement.** `packages/harness/src/extension/commands.ts`:

```ts
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import type { WorldHandle } from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { HarnessRuntime } from "#harness/contract/services";
import { humanStop } from "#harness/extension/input";
import { queryLog } from "#harness/log/query";

type Run = (args: string, ctx: ExtensionCommandContext) => Promise<void>;
type Command = Omit<RegisteredCommand, "name" | "sourceInfo">;
type Send = (handle: WorldHandle, text: string) => void;

export const LOG_COMMAND_ROWS = 20;
export const OFFLINE_TEXT = "The game connection is down. Run /connect.";

const WORDS = /\s+/;
const LABEL_JUNK = /[^a-z0-9_-]+/g;

function logInput(rt: HarnessRuntime, text: string): void {
  const data = { stoppedRuns: [], stopReflex: false, text, via: "command" };
  rt.log.append({
    class: "log",
    data,
    domain: "human",
    event: "human/input",
    text: `Human: ${text}`,
  });
}

function logged(rt: HarnessRuntime, name: string, run: Run): Run {
  return async (args, ctx) => {
    logInput(rt, `/${name} ${args}`.trim());
    await run(args, ctx);
  };
}

async function send(
  rt: HarnessRuntime,
  ctx: ExtensionCommandContext,
  deliver: (handle: WorldHandle) => void,
): Promise<void> {
  const handle = rt.handle();
  if (!handle) return ctx.ui.notify(OFFLINE_TEXT, "error");
  await rt.mutex.run(() => deliver(handle));
}

function chat(rt: HarnessRuntime, deliver: Send): Run {
  return async (args, ctx) => {
    const text = args.trim();
    if (!text)
      return ctx.ui.notify("Write the text after the command.", "warning");
    await send(rt, ctx, (handle) => deliver(handle, text));
  };
}

function whisper(rt: HarnessRuntime): Run {
  return async (args, ctx) => {
    const [to, ...words] = args.trim().split(WORDS);
    const text = words.join(" ");
    if (!(to && text)) return ctx.ui.notify("Use /w <name> <text>.", "warning");
    await send(rt, ctx, (handle) => handle.sendWhisper(to, text));
  };
}

function stop(rt: HarnessRuntime): Run {
  return (_args, ctx) => {
    const stopped = humanStop({ rt, text: "/stop", via: "command" });
    const names = stopped.map((run) => `${run.id} (${run.kind})`).join(", ");
    ctx.ui.notify(
      names
        ? `Stopped ${names}.`
        : "No run was active. Movement and attacks stopped.",
      "info",
    );
    return Promise.resolve();
  };
}

function now(rt: HarnessRuntime): Run {
  return (_args, ctx) => {
    ctx.ui.notify(
      rt.session.lastNow ?? "No [now] line was sent to the model yet.",
      "info",
    );
    return Promise.resolve();
  };
}

function log(pi: ExtensionAPI, rt: HarnessRuntime): Run {
  return (args, ctx) => {
    const query = { find: args.trim() || undefined, limit: LOG_COMMAND_ROWS };
    const page = queryLog({
      log: rt.log,
      now: rt.clock.now(),
      query,
      runs: rt.runs,
      turnStartSeq: 0,
    });
    const more = page.more > 0 ? `, ${page.more} more` : "";
    ctx.ui.notify(
      `Game log ${page.label}: ${page.rows.length} rows${more}.`,
      "info",
    );
    for (const entry of page.rows) pi.appendEntry("wow-human", { entry });
    return Promise.resolve();
  };
}

function connect(rt: HarnessRuntime): Run {
  return async (_args, ctx) => {
    if (rt.connection() === "online")
      return ctx.ui.notify("The game connection is already up.", "info");
    try {
      await rt.connect();
      ctx.ui.notify("Connected to the game.", "info");
    } catch (error) {
      ctx.ui.notify(`Connect failed: ${messageOf(error)}`, "error");
    }
  };
}

function disconnect(rt: HarnessRuntime): Run {
  return async (_args, ctx) => {
    await rt.disconnect();
    ctx.ui.notify("Disconnected. Run /connect to log in again.", "info");
  };
}

function wake(rt: HarnessRuntime): Run {
  return (args, ctx) => {
    const value = args.trim();
    if (value !== "on" && value !== "off") {
      ctx.ui.notify("Use /wake on or /wake off.", "warning");
      return Promise.resolve();
    }
    rt.session.wake = value === "on";
    ctx.ui.notify(`Wake is ${value}.`, "info");
    return Promise.resolve();
  };
}

function snapshot(rt: HarnessRuntime): Run {
  return async (args, ctx) => {
    const label =
      args.trim().toLowerCase().replace(LABEL_JUNK, "-") ||
      `manual-${rt.clock.now()}`;
    const path = await rt.snapshots.write(label);
    ctx.ui.notify(`Wrote ${path}.`, "info");
  };
}

function commands(
  pi: ExtensionAPI,
  rt: HarnessRuntime,
): Record<string, Command> {
  const entry = (description: string, name: string, run: Run): Command => ({
    description,
    handler: logged(rt, name, run),
  });
  return {
    connect: entry("Log the character in again", "connect", connect(rt)),
    disconnect: entry(
      "Log the character out and keep the harness open",
      "disconnect",
      disconnect(rt),
    ),
    g: entry(
      "Say text in guild chat",
      "g",
      chat(rt, (handle, text) => handle.sendGuild(text)),
    ),
    log: entry(
      "Show the last 20 game log rows (optional filter)",
      "log",
      log(pi, rt),
    ),
    now: entry("Show the last [now] line the model got", "now", now(rt)),
    p: entry(
      "Say text in party chat",
      "p",
      chat(rt, (handle, text) => handle.sendParty(text)),
    ),
    say: entry(
      "Say text near the character",
      "say",
      chat(rt, (handle, text) => handle.sendSay(text)),
    ),
    snapshot: entry("Write a world snapshot file", "snapshot", snapshot(rt)),
    stop: {
      description: "Stop every run, movement and attack",
      handler: stop(rt),
    },
    w: entry("Whisper a player: /w <name> <text>", "w", whisper(rt)),
    wake: entry("Turn game wake-ups on or off: /wake on|off", "wake", wake(rt)),
  };
}

export function installCommands(pi: ExtensionAPI, rt: HarnessRuntime): void {
  for (const [name, command] of Object.entries(commands(pi, rt)))
    pi.registerCommand(name, command);
}
```

- [ ] **Add the insertion line.** In `packages/harness/src/extension/extension.ts` add
  the import with the other installer imports:

```ts
import { installCommands } from "#harness/extension/commands";
```

and add `installCommands(pi, rt);` in the factory body so that the order is
the order of contract 2.5: after `installUi(pi, rt);` when U11a has landed,
else after the last installer line that is present, and always before
`installShutdown(pi, rt);`. Change no other line.

- [ ] **Run the tests and see them pass.**

```bash
mise test packages/harness/src/extension/commands.test.ts
bun run tsc --noEmit -p packages/harness
mise lint
mise format
```

Expected: every test passes; `tsc`, `lint` and `format` exit 0.

The F7a tests of `extension.ts` must still pass: run
`mise test packages/harness/src/extension`.

- [ ] **Commit.**

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add packages/harness/src/extension/commands.ts \
  packages/harness/src/extension/commands.test.ts \
  packages/harness/src/extension/extension.ts
mise exec -- git commit -m "feat: Add harness human slash commands" -m "The human needs to stop, chat, read the log and see the last [now] line without a model turn. The commands log their own human/input rows because Pi runs them before the input event."
```


---

## Task U11a: mount the UI in each Pi session

**Needs:** U2, U3, U4, U9, U1c, A3 (`nowSnapshot`), F5a, F7a, P3 (it lands `installPrompt` in `extension.ts` first).

**Files**

- Create: `packages/harness/src/ui/install.ts`
- Modify: `packages/harness/src/extension/extension.ts` (insertion point: one import line and one call line)
- Test: `packages/harness/src/ui/install.test.ts`

**Interfaces**

- Consumes: `nowSnapshot(rt: HarnessRuntime): NowSnapshot | undefined` (A3);
  `createFooter`, `FooterChrome` (U2); `createTicker` (U3);
  `renderEventCard`, `renderHumanLine` (U4); `titleFor`, `workingMessage`
  (U9); `glyphSetName()` (U1a); `HarnessRuntime` members `log`, `flags`,
  `session`, `connection`, `ready.inWorld`; `Capabilities`
  (`@tuicraft/core`); Pi: `pi.on("session_start" | "session_shutdown")`,
  `pi.registerMessageRenderer`, `pi.registerEntryRenderer`,
  `pi.getThinkingLevel`, `ctx.mode`, `ctx.model`, `ctx.getContextUsage`,
  `ctx.ui.setFooter`, `setWidget`, `setTitle`, `setWorkingMessage`.
- Produces:

```ts
export type FooterMount = "footer" | "widget";
export type Factory = (tui: TUI, theme: Theme) => Component;
export const REPAINT_GAP_MS = 100;
export const TICK_MS = 1000;
export function mountFooter(ui: ExtensionUIContext, factory: Factory, mount: FooterMount): void;
export function installUi(pi: ExtensionAPI, rt: HarnessRuntime): void;
```

Behaviour (contract 2.14, design E):

- The two renderers register once, in `installUi` itself, not in
  `session_start` (which fires again on `/new`, `/resume` and `/fork`).
- On `session_start` with `ctx.mode === "tui"` only (luna-runtime #13: the
  faux smoke tests run without a TUI), it mounts the footer through
  `mountFooter(…, FOOTER_MOUNT)` and the ticker with
  `setWidget("wow-ticker", …, { placement: "aboveEditor" })`, then paints
  once. A second `session_start` unmounts the first.
- One cached `NowSnapshot` feeds the footer, the title and the working
  message. It is refreshed only on a repaint, so a key press does not
  rebuild views.
- A repaint happens at most once per `REPAINT_GAP_MS` after a log append,
  and once per `TICK_MS` tick. It refreshes the snapshot, calls `setTitle`
  and `setWorkingMessage`, and calls `requestRender` on each TUI that a
  factory got.
- Kills and XP for the ticker count `combat/kill_credit` rows and the
  `amount` of `xp/gain` rows from the session start.
- `session_shutdown` clears the interval, the pending repaint and the log
  subscriptions.
- The tests use the found plan's `createTestRuntime` with its mock handle,
  so `nowSnapshot(rt)` (A3) runs on that handle. If it throws there, the
  fault is in A3 or in the fixture, not in `install.ts`; report it to the
  owner of that task and do not catch it here.
- `FOOTER_MOUNT` is a module constant, `"footer"`. The V5 fallback
  (`"widget"`, a 4-line widget below the editor) is the same code path
  through `mountFooter`; U11b flips the constant if V5 fails (contract
  issue 9).

**Steps**

- [ ] **Write the failing test.** `packages/harness/src/ui/install.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { FOOTER_ROWS } from "#harness/ui/footer";
import { nerd } from "#harness/ui/glyphs";
import {
  type Factory,
  installUi,
  mountFooter,
  REPAINT_GAP_MS,
  TICK_MS,
} from "#harness/ui/install";
import { TICKER_ROWS } from "#harness/ui/ticker";
import {
  createFakeTui,
  createPiRecorder,
  createUiRecorder,
  recorderContext,
  type UiRecorder,
} from "#test-support/pi-recorder";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { plain, testTheme } from "#test-support/ui-fixture";

const theme = testTheme();

async function mounted(mode: "tui" | "rpc" = "tui") {
  const { rt } = await createTestRuntime();
  const fake = createPiRecorder();
  installUi(fake.pi, rt);
  const ui = createUiRecorder();
  const ctx = recorderContext({ contextPct: 14, mode, ui: ui.ui });
  await fake.fire(
    "session_start",
    { reason: "startup", type: "session_start" },
    ctx,
  );
  return { ctx, fake, rt, ui };
}

function asFactory(value: unknown): Factory {
  if (typeof value !== "function") throw new Error("no factory");
  return value as Factory;
}

function widget(ui: UiRecorder, key: string): Factory {
  const call = ui.named("setWidget").find((args) => args[0] === key);
  return asFactory(call?.[1]);
}

function footerOf(ui: UiRecorder): Factory {
  const call = ui.named("setFooter")[0];
  return call ? asFactory(call[0]) : widget(ui, "wow-footer");
}

function mount(factory: Factory): {
  component: Component;
  tui: TUI;
  renders: () => number;
} {
  const { tui, renders } = createFakeTui();
  return { component: factory(tui, theme), renders, tui };
}

describe("installUi", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("registers the event card and human line renderers", async () => {
    const { fake } = await mounted("rpc");
    expect(fake.messageRenderers.has("wow-event")).toBe(true);
    expect(fake.entryRenderers.has("wow-human")).toBe(true);
  });

  test("outside the TUI it makes no UI call", async () => {
    const { ui } = await mounted("rpc");
    expect(ui.calls).toEqual([]);
  });

  test("mounts a 4-row footer and a 6-row ticker above the editor", async () => {
    const { ui } = await mounted();
    const footer = mount(footerOf(ui)).component;
    const ticker = mount(widget(ui, "wow-ticker")).component;
    const options = ui
      .named("setWidget")
      .find((args) => args[0] === "wow-ticker")?.[2];
    expect(footer.render(120)).toHaveLength(FOOTER_ROWS);
    expect(ticker.render(120)).toHaveLength(TICKER_ROWS);
    expect(options).toEqual({ placement: "aboveEditor" });
  });

  test("sets the tab title and the working message on mount", async () => {
    const { ui } = await mounted();
    expect(ui.named("setTitle")).toHaveLength(1);
    expect(ui.named("setWorkingMessage")).toHaveLength(1);
  });

  test("log appends repaint at most once per 100 ms", async () => {
    const { rt, ui } = await mounted();
    const { renders } = mount(footerOf(ui));
    for (let i = 0; i < 5; i += 1)
      rt.log.append({
        class: "log",
        data: {},
        domain: "xp",
        event: "xp/gain",
        text: `xp ${i}`,
      });
    expect(renders()).toBe(0);
    jest.advanceTimersByTime(REPAINT_GAP_MS);
    expect(renders()).toBe(1);
    expect(ui.named("setTitle")).toHaveLength(2);
  });

  test("a 1 s tick repaints while nothing happens", async () => {
    const { ui } = await mounted();
    const { renders } = mount(footerOf(ui));
    jest.advanceTimersByTime(TICK_MS + REPAINT_GAP_MS);
    expect(renders()).toBe(1);
  });

  test("kills and XP from the log reach the ticker head", async () => {
    const { rt, ui } = await mounted();
    const ticker = mount(widget(ui, "wow-ticker")).component;
    rt.log.append({
      class: "log",
      data: { name: "Springpaw Stalker" },
      domain: "combat",
      event: "combat/kill_credit",
      text: "Springpaw Stalker killed",
    });
    rt.log.append({
      class: "log",
      data: { amount: 84 },
      domain: "xp",
      event: "xp/gain",
      text: "+84 xp",
    });
    expect(plain(ticker.render(160))[0]).toContain(
      `${nerd.kill} 1 kill ${nerd.xp} +84 xp`,
    );
  });

  test("session_shutdown stops the timers", async () => {
    const { ctx, fake, ui } = await mounted();
    const { renders } = mount(footerOf(ui));
    await fake.fire(
      "session_shutdown",
      { reason: "quit", type: "session_shutdown" },
      ctx,
    );
    jest.advanceTimersByTime(5 * TICK_MS);
    expect(renders()).toBe(0);
  });
});

describe("mountFooter", () => {
  test("the V5 fallback puts the footer in a widget below the editor", () => {
    const ui = createUiRecorder();
    const factory: Factory = () => ({
      invalidate: () => undefined,
      render: () => [],
    });
    mountFooter(ui.ui, factory, "widget");
    expect(ui.named("setWidget")).toEqual([
      ["wow-footer", factory, { placement: "belowEditor" }],
    ]);
    mountFooter(ui.ui, factory, "footer");
    expect(ui.named("setFooter")).toEqual([[factory]]);
  });
});
```

- [ ] **Run the test and see it fail.**

```bash
mise test packages/harness/src/ui/install.test.ts
```

Expected: FAIL — error: Cannot find module "#harness/ui/install" from ".../src/ui/install.test.ts".

- [ ] **Implement.** `packages/harness/src/ui/install.ts`:

```ts
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Capabilities } from "@tuicraft/core";
import type {
  GameLogEntry,
  HumanLineDetails,
  WowEventDetails,
} from "#harness/contract/log";
import type { HarnessRuntime } from "#harness/contract/services";
import type { NowSnapshot } from "#harness/contract/views";
import { nowSnapshot } from "#harness/ops/views";
import { renderEventCard, renderHumanLine } from "#harness/ui/cards";
import { glyphSetName } from "#harness/ui/context";
import { createFooter, type FooterChrome } from "#harness/ui/footer";
import { titleFor, workingMessage } from "#harness/ui/status-line";
import { createTicker } from "#harness/ui/ticker";

export type FooterMount = "footer" | "widget";
export type Factory = (tui: TUI, theme: Theme) => Component;

type Hud = {
  snapshot: () => NowSnapshot | undefined;
  refresh: () => void;
  kills: () => number;
  xp: () => number;
  dispose: () => void;
};
type MountInit = {
  pi: ExtensionAPI;
  rt: HarnessRuntime;
  ctx: ExtensionContext;
};

export const REPAINT_GAP_MS = 100;
export const TICK_MS = 1000;

const FOOTER_MOUNT: FooterMount = "footer";

const CHIPS = [
  ["jev", "jev"],
  ["navigation", "nav"],
  ["factions", "factions"],
  ["spells", "spells"],
] as const;

function missingOf(
  capabilities: Capabilities | undefined,
): FooterChrome["missing"] {
  if (!capabilities) return [];
  return CHIPS.filter(([key]) => !capabilities[key]).map(([, chip]) => chip);
}

function footerChrome({ pi, rt, ctx }: MountInit): FooterChrome {
  return {
    connection: rt.connection(),
    contextPct: ctx.getContextUsage()?.percent ?? undefined,
    glyphSet: glyphSetName(),
    logRows: rt.log.count(),
    missing: missingOf(rt.ready.inWorld()?.capabilities),
    model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : rt.flags.model,
    thinking: pi.getThinkingLevel(),
    unreadWhispers: rt.session.unreadWhispers,
    wake: rt.session.wake,
  };
}

function createHud(rt: HarnessRuntime): Hud {
  let snapshot = nowSnapshot(rt);
  let kills = 0;
  let xp = 0;
  const count = (entry: GameLogEntry) => {
    const amount = entry.data["amount"];
    if (entry.event === "combat/kill_credit") kills += 1;
    if (entry.event === "xp/gain" && typeof amount === "number") xp += amount;
  };
  const dispose = rt.log.subscribe(count);
  const refresh = () => {
    snapshot = nowSnapshot(rt);
  };
  return {
    dispose,
    kills: () => kills,
    refresh,
    snapshot: () => snapshot,
    xp: () => xp,
  };
}

function createRepaint(paint: () => void): {
  request: () => void;
  dispose: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    timer = undefined;
    paint();
  };
  const request = () => {
    timer ??= setTimeout(run, REPAINT_GAP_MS);
  };
  return { dispose: () => clearTimeout(timer), request };
}

export function mountFooter(
  ui: ExtensionUIContext,
  factory: Factory,
  mount: FooterMount,
): void {
  if (mount === "widget") {
    ui.setWidget("wow-footer", factory, { placement: "belowEditor" });
    return;
  }
  ui.setFooter(factory);
}

function mountUi(init: MountInit): () => void {
  const { rt, ctx } = init;
  const hud = createHud(rt);
  const tuis = new Set<TUI>();
  const track =
    (factory: Factory): Factory =>
    (tui, theme) => {
      tuis.add(tui);
      return factory(tui, theme);
    };
  const paint = () => {
    hud.refresh();
    ctx.ui.setTitle(titleFor(hud.snapshot()));
    ctx.ui.setWorkingMessage(workingMessage(hud.snapshot()?.run));
    for (const tui of tuis) tui.requestRender();
  };
  const repaint = createRepaint(paint);
  const unsubscribe = rt.log.subscribe(repaint.request);
  const tick = setInterval(repaint.request, TICK_MS);
  const footer = createFooter({
    chrome: () => footerChrome(init),
    snapshot: hud.snapshot,
  });
  const ticker = createTicker({
    kills: hud.kills,
    now: () => rt.clock.now(),
    recent: (n) => rt.log.recent(n),
    run: () => hud.snapshot()?.run,
    xp: hud.xp,
  });
  mountFooter(ctx.ui, track(footer), FOOTER_MOUNT);
  ctx.ui.setWidget("wow-ticker", track(ticker), { placement: "aboveEditor" });
  paint();
  return () => {
    unsubscribe();
    clearInterval(tick);
    repaint.dispose();
    hud.dispose();
    tuis.clear();
  };
}

export function installUi(pi: ExtensionAPI, rt: HarnessRuntime): void {
  pi.registerMessageRenderer<WowEventDetails>("wow-event", renderEventCard);
  pi.registerEntryRenderer<HumanLineDetails>("wow-human", renderHumanLine);
  let unmount: (() => void) | undefined;
  pi.on("session_start", (_event, ctx) => {
    unmount?.();
    unmount = ctx.mode === "tui" ? mountUi({ ctx, pi, rt }) : undefined;
  });
  pi.on("session_shutdown", () => {
    unmount?.();
    unmount = undefined;
  });
}
```

- [ ] **Add the insertion line.** In `packages/harness/src/extension/extension.ts` add

```ts
import { installUi } from "#harness/ui/install";
```

and `installUi(pi, rt);` in the factory body after `installPrompt(pi, rt);`
(or after the last installer line that is present) and before
`installCommands(pi, rt);` and `installShutdown(pi, rt);` (contract 2.5).
Change no other line.

- [ ] **Run the tests and see them pass.**

```bash
mise test packages/harness/src/ui/install.test.ts
mise test packages/harness/src/extension
bun run tsc --noEmit -p packages/harness
mise lint
mise format
```

Expected: every test passes; `tsc`, `lint` and `format` exit 0.

- [ ] **Commit.**

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add packages/harness/src/ui/install.ts \
  packages/harness/src/ui/install.test.ts \
  packages/harness/src/extension/extension.ts
mise exec -- git commit -m "feat: Mount the harness UI in Pi sessions" -m "The footer, ticker, cards, title and working message need one owner that mounts them per session and repaints them from the game log. A 10 Hz cap and a 1 s tick keep the pane live without a render on every packet."
```


---

## Task U11b: Orca pane smoke and the V5 decision

**Needs:** U10, U11a, F6b (BOOT: the harness starts end to end), F8e (the
V5 live result in `smoke-live.md`), a valid Codex login in omp (`--check`
exits 0), and the soap service on t1.

This task changes no code unless V5 failed. It is the live gate of this
area: no U task changes protocol or daemon behaviour, so `mise test:live`
does not apply, and the design asks for an Orca pane smoke for harness
work instead (R18, design I). The pane uses a throwaway soap account of
its own and never a character that another agent owns (AGENTS.md
"Testing"). The commands in the smoke do not start a model turn.

**Files**

- Create: `docs/plans/2026-09-26-pi-harness-epic/smoke-ui.md` (written by the script below)
- Modify, only if V5 failed: `packages/harness/src/ui/install.ts` (the `FOOTER_MOUNT` line)
- Scratch, not committed: `tmp/ui-smoke/` (profile, secrets list, run dir, script)

**Interfaces**

- Consumes: `bun packages/harness/src/entry.ts --profile <file> --run-dir <dir> --glyphs nerd`
  and `--check` (F6b, contract 2.4); `bun packages/factory/src/main.ts soap create <preset>`
  and `soap delete <ACCOUNT>` (AGENTS.md "Testing"); `orca-ide terminal create|read|send|wait|close`
  (contract 2.13 pane commands; `create` returns the handle at
  `.result.terminal.handle`, `read --screen` returns the rows at
  `.result.terminal.tail`, measured in `luna/orca-create.json` and
  `luna/read1.json`); `tagNerdGlyphs` (U1a).
- Produces: `smoke-ui.md` with one PASS or FAIL row per check and the last
  tagged frame.

**Steps**

- [ ] **Read the V5 result.** Open
  `docs/plans/2026-09-26-pi-harness-epic/smoke-live.md` (F8e) and find the
  V5 row. If it says that `setFooter` from `session_start` did not show the
  footer in the pane, do the next step. Else skip it.

- [ ] **Only if V5 failed: flip the footer mount.**

```bash
cd "$(git rev-parse --show-toplevel)"
sed -i 's/const FOOTER_MOUNT: FooterMount = "footer";/const FOOTER_MOUNT: FooterMount = "widget";/' packages/harness/src/ui/install.ts
rg -n 'const FOOTER_MOUNT' packages/harness/src/ui/install.ts
mise test packages/harness/src/ui/install.test.ts
```

Expected: `rg` prints the `"widget"` line; the U11a tests still pass,
because they find the footer factory through `setFooter` or through the
`wow-footer` widget.

- [ ] **Write the smoke script** to `tmp/ui-smoke.sh` (scratch; `tmp/` is
  ephemeral) with this content:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
D=tmp/ui-smoke
REC=docs/plans/2026-09-26-pi-harness-epic/smoke-ui.md
rm -rf "$D" && mkdir -p "$D" && chmod 700 "$D"
bun packages/factory/src/main.ts soap create eversong10 > "$D/profile.json"
chmod 600 "$D/profile.json"
ACC=$(jq -r .account "$D/profile.json")
CHAR=$(jq -r .character "$D/profile.json")
jq -r .password "$D/profile.json" > "$D/secrets.txt"
bun packages/harness/src/entry.ts --profile "$D/profile.json" --check
CMD="bun packages/harness/src/entry.ts --profile $D/profile.json --run-dir $D/run --glyphs nerd --wake off"
T=$(orca-ide terminal create --worktree "path:$PWD" --title ui-smoke --command "$CMD" --json | jq -r .result.terminal.handle)
tagged() {
  orca-ide terminal read --terminal "$T" --screen --json | jq -r '.result.terminal.tail[]' |
    (cd packages/harness && bun -e 'import { tagNerdGlyphs } from "#harness/ui/glyphs"; process.stdout.write(tagNerdGlyphs(await Bun.stdin.text()))')
}
waitfor() {
  for _ in $(seq 1 60); do tagged | rg -q -- "$1" && return 0; sleep 1; done
  return 1
}
send() { orca-ide terminal send --terminal "$T" --text "$1" --enter --json > /dev/null; }
check() {
  if eval "$2"; then echo "| $1 | PASS |" >> "$REC"; else echo "| $1 | FAIL |" >> "$REC"; fi
}
{
  echo "# Harness UI pane smoke (U11b)"
  echo
  echo "Run $(date -u +%Y-%m-%dT%H:%M:%SZ) at $(git rev-parse --short HEAD), a throwaway soap account (preset eversong10), glyphs nerd, 1 Orca pane."
  echo
  echo "| Check | Result |"
  echo "| --- | --- |"
} > "$REC"
MOUNT=$(rg -o 'FOOTER_MOUNT: FooterMount = "(\w+)"' -r '$1' packages/harness/src/ui/install.ts)
echo "Footer mount: $MOUNT" >> "$REC"
echo >> "$REC"
check "footer row 1 shows <self> and the character" "waitfor '<self> $CHAR'"
check "footer row 4 (chrome) is on screen" "tagged | rg -q 'glyphs:nerd'"
if [ "$MOUNT" = footer ]; then
  check "V5: the setFooter footer is the last screen row" "tagged | rg -v '^\s*$' | tail -1 | rg -q 'glyphs:nerd'"
fi
check "footer row 3 shows the place" "tagged | rg -q '<mapPin> '"
check "ticker head is drawn above the editor" "tagged | rg -q '(<runRunning>|<idle> no run)'"
check "--wake off shows wake:off in the footer" "tagged | rg -q 'wake:off'"
send "/now"
check "/now shows a notice" "waitfor '(\[now |No \[now\] line)'"
send "/say harness ui smoke"
check "/say logs human/input" "sleep 2 && rg -q '\"text\":\"/say harness ui smoke\"' $D/run/gamelog.jsonl"
send "/log"
check "/log shows the game log notice" "waitfor 'Game log '"
send "/snapshot smoke"
check "/snapshot writes the file" "sleep 2 && test -f $D/run/snapshots/smoke.json"
send "/stop"
check "/stop answers" "waitfor '(Stopped r|No run was active)'"
send "/wake on"
check "/wake on shows wake:on in the footer" "waitfor 'wake:on'"
{ echo; echo "Last frame (tagNerdGlyphs):"; echo; echo '~~~text'; tagged; echo '~~~'; } >> "$REC"
orca-ide terminal send --terminal "$T" --text $'\x03\x03' --json > /dev/null
orca-ide terminal wait --terminal "$T" --for exit --timeout-ms 15000 --json > /dev/null || orca-ide terminal close --terminal "$T" --tab --json > /dev/null
LEAKS=$(rg -uu -l -F -f "$D/secrets.txt" "$D/run" || true)
check "no password in the run dir" "test -z '$LEAKS'"
bun packages/factory/src/main.ts soap delete "$ACC"
rm -rf "$D"
cat "$REC"
```

- [ ] **Run the smoke.**

```bash
cd "$(git rev-parse --show-toplevel)"
bash tmp/ui-smoke.sh
```

The harness starts with `--wake off`, so no game event starts a model
turn during the smoke; `/wake on` is the last command before the quit.

Expected: every row says PASS: 13 rows with the `footer` mount, 12 with
the `widget` mount (the V5 row is only checked for `footer`, because with
the widget the built-in Pi footer stays the last row). If the soap service
or the game server is down, stop and report to the coordinator (AGENTS.md:
infrastructure failures go to the maintainer); an infrastructure failure
is not a FAIL row.

- [ ] **Fix and repeat.** A FAIL in any row other than the V5 row is a
  defect in U2–U11a. Find the cause with a unit test in the owning task's
  test file (the U-area builder owns those files), fix it there, commit
  that fix with its own subject, and run the smoke again until every row
  passes.

- [ ] **Commit the record** (and `install.ts` only when the flip was made).

```bash
cd "$(git rev-parse --show-toplevel)"
mise ci:checks
git add docs/plans/2026-09-26-pi-harness-epic/smoke-ui.md
git status --short packages/harness/src/ui/install.ts | rg -q . && git add packages/harness/src/ui/install.ts
mise exec -- git commit -m "docs: Record the harness UI pane smoke" -m "The footer, ticker and human commands are checked in a real Orca pane on a throwaway account, and the record says which footer mount the pane needs (V5)."
```


---

## Build order inside this area

| Step | Tasks | Needs outside this area |
| --- | --- | --- |
| 0 | U1a, U1c | F1 |
| 1 | U1b, then U2, U3, U4, U5, U9 in any order | F2 |
| 2 | U6, then U7, then U8 (they share `renderers/registry.ts`) | — |
| 4 | U11a, then U10 (they share `extension.ts`) | F5a (found plan: F5ab), F7a, F7b, L2, A3, P3 (before U11a) |
| 8 | U11b | F6b, F8e |

U6, U7 and U8 each edit only their own map values and one import line in
`renderers/registry.ts`. They land in the order U6, U7, U8 ([plan index](../2026-09-26-pi-harness-epic-plan.md)); the second
rebases onto the first; the lines do not overlap.
