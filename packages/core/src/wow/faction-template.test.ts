import { describe, expect, test } from "bun:test";
import { dbcFiles, packDbc } from "#test-support/dbc";
import { loadFactionTemplates } from "#wow/faction-template";

const FIELDS = 14;
function templateRow(cells: Record<number, number>): number[] {
  const row = new Array<number>(FIELDS).fill(0);
  for (const [key, value] of Object.entries(cells)) row[Number(key)] = value;
  return row;
}

function writeTemplates(rows: number[][]) {
  return dbcFiles(new Map([["FactionTemplate.dbc", packDbc(FIELDS, rows)]]));
}

describe("loadFactionTemplates", () => {
  test("fails when FactionTemplate.dbc is missing", async () => {
    await expect(loadFactionTemplates(dbcFiles(new Map()))).rejects.toThrow(
      /FactionTemplate\.dbc/,
    );
  });

  test("fails on unsupported layout", async () => {
    const buf = packDbc(FIELDS, [templateRow({ 0: 1 })]);
    const view = new DataView(buf.buffer);
    view.setUint32(8, 4, true);
    view.setUint32(12, 16, true);
    const truncated = buf.subarray(0, 20 + 16 + 1);
    const source = dbcFiles(new Map([["FactionTemplate.dbc", truncated]]));
    await expect(loadFactionTemplates(source)).rejects.toThrow(/14/);
  });
});

describe("FactionTemplateCatalog.relation", () => {
  test("returns unknown for missing templates instead of inventing hostility", async () => {
    const catalog = await loadFactionTemplates(
      writeTemplates([templateRow({ 0: 1, 1: 10, 3: 2, 4: 2 })]),
    );
    expect(catalog.get(99)).toBeUndefined();
    expect(catalog.relation(1, 99)).toBe("unknown");
    expect(catalog.relation(99, 1)).toBe("unknown");
  });

  test("treats the same parent faction as friendly", async () => {
    const catalog = await loadFactionTemplates(
      writeTemplates([
        templateRow({ 0: 1, 1: 67, 3: 2 }),
        templateRow({ 0: 2, 1: 67, 3: 2 }),
      ]),
    );
    expect(catalog.relation(1, 2)).toBe("friendly");
  });

  test("uses explicit enemy and friend faction lists", async () => {
    const catalog = await loadFactionTemplates(
      writeTemplates([
        templateRow({ 0: 10, 1: 100, 6: 200 }),
        templateRow({ 0: 11, 1: 200 }),
        templateRow({ 0: 12, 1: 100, 10: 300 }),
        templateRow({ 0: 13, 1: 300 }),
      ]),
    );
    expect(catalog.relation(10, 11)).toBe("hostile");
    expect(catalog.relation(12, 13)).toBe("friendly");
  });

  test("applies group masks when lists are empty", async () => {
    const catalog = await loadFactionTemplates(
      writeTemplates([
        templateRow({ 0: 1, 1: 1, 3: 2, 4: 2, 5: 4 }),
        templateRow({ 0: 2, 1: 2, 3: 4, 4: 4, 5: 2 }),
        templateRow({ 0: 3, 1: 3, 3: 8 }),
      ]),
    );
    expect(catalog.relation(1, 2)).toBe("hostile");
    expect(catalog.relation(1, 1)).toBe("friendly");
    expect(catalog.relation(1, 3)).toBe("neutral");
  });

  test("checks hostility before friendship", async () => {
    const catalog = await loadFactionTemplates(
      writeTemplates([
        templateRow({ 0: 1, 1: 50, 6: 50 }),
        templateRow({ 0: 2, 1: 50 }),
      ]),
    );
    expect(catalog.relation(1, 2)).toBe("hostile");
  });

  test("is friendly when the target lists the source as a friend", async () => {
    const catalog = await loadFactionTemplates(
      writeTemplates([
        templateRow({ 0: 1, 1: 10 }),
        templateRow({ 0: 2, 1: 20, 10: 10 }),
      ]),
    );
    expect(catalog.relation(1, 2)).toBe("friendly");
  });

  test("hates everyone except friends when flagged", async () => {
    const catalog = await loadFactionTemplates(
      writeTemplates([
        templateRow({ 0: 1, 1: 10, 2: 0x20_00 }),
        templateRow({ 0: 2, 1: 20 }),
      ]),
    );
    expect(catalog.relation(1, 2)).toBe("hostile");
    expect(catalog.relation(2, 1)).toBe("neutral");
  });
});
