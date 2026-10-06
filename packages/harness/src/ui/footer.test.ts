import { afterEach, describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { setGlyphs } from "#harness/ui/context";
import {
  createFooter,
  FOOTER_ROWS,
  type FooterChrome,
  footerLines,
} from "#harness/ui/footer";
import { ascii, nerd } from "#harness/ui/glyphs";
import { createFakeTui } from "#test-support/pi-recorder";
import {
  nowFixture,
  painted,
  plain,
  selfFixture,
  testTheme,
  unitFixture,
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

const ghostWith = (reclaimInMs: number | undefined) =>
  nowFixture({
    attackers: [],
    recovery: {
      corpseCompass: "SW",
      corpseYd: 57.3,
      reclaimInMs,
      spiritHealer: undefined,
    },
    self: selfFixture({ hp: 0, inCombat: false, life: "ghost" }),
    target: undefined,
  });

const ghost = ghostWith(12_000);

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

  test("the self row shows the combo points above zero and drops the word at zero", () => {
    const rowFor = (comboPoints: number | undefined) =>
      plain(
        footerLines({
          chrome,
          snapshot: nowFixture({ self: selfFixture({ comboPoints }) }),
          theme,
          width: 220,
        }),
      )[0];
    expect(rowFor(3)).toContain("CP 3");
    expect(rowFor(0)).not.toContain("CP");
    expect(rowFor(undefined)).not.toContain("CP");
  });

  test("a ghost sees the corpse row instead of a target", () => {
    const [self, row] = plain(
      footerLines({ chrome, snapshot: ghost, theme, width: 160 }),
    );
    expect(self).toContain(`${nerd.ghost} GHOST`);
    expect(row).toContain(`${nerd.corpse} 57.3y ${nerd.compassSW}`);
    expect(row).toContain(`reclaim in ${nerd.clock} 12s`);
    expect(row).not.toContain("GHOST");
  });

  test("a dead or vanished target clears the target row", () => {
    for (const target of [
      unitFixture({ alive: false, hp: 0 }),
      unitFixture({ hp: 0, maxHp: 0 }),
    ]) {
      const [, row] = plain(
        footerLines({
          chrome,
          snapshot: nowFixture({ target }),
          theme,
          width: 160,
        }),
      );
      expect(row).toContain(`${nerd.target} no target`);
      expect(row).not.toContain("Springpaw Stalker");
      expect(row).not.toContain("Shadow Word: Pain");
      expect(row).not.toMatch(/\b0\/\d+/);
    }
  });

  test("the reclaim clause follows the [now] recovery facts", () => {
    const rowFor = (reclaimInMs: number | undefined) =>
      plain(
        footerLines({
          chrome,
          snapshot: ghostWith(reclaimInMs),
          theme,
          width: 160,
        }),
      )[1] ?? "";
    expect(rowFor(undefined)).not.toContain("reclaim");
    expect(rowFor(0)).toContain("reclaim ready");
    expect(rowFor(30_000)).toContain(`reclaim in ${nerd.clock} 30s`);
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

  test("missing capabilities are painted as errors and a lost link as a warning", () => {
    const last =
      footerLines({
        chrome: { ...chrome, connection: "backoff" },
        snapshot: undefined,
        theme,
        width: 200,
      })[3] ?? "";
    expect(painted(theme, "warning", last)).toBe(true);
    expect(painted(theme, "error", last)).toBe(true);
    const text = plain([last])[0] ?? "";
    expect(text).toStartWith("backoff · ");
    expect(text).toContain("no-jev");
    expect(text).toContain("no-nav");
  });

  test("waits for the world before the first snapshot", () => {
    expect(
      plain(footerLines({ chrome, snapshot: undefined, theme, width: 80 }))[0],
    ).toBe(`${nerd.idle} waiting for the world…`);
  });

  test("the ascii set draws its own glyph and no nerd glyph", () => {
    setGlyphs("ascii");
    const text = footerLines({
      chrome,
      snapshot: nowFixture(),
      theme,
      width: 220,
    }).join("\n");
    expect(text).toContain(ascii.self);
    for (const glyph of Object.values(nerd)) expect(text).not.toContain(glyph);
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
