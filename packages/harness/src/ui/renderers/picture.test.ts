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
