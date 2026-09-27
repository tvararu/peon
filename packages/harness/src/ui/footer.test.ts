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
