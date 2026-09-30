import { describe, expect, test } from "bun:test";
import { dbcFiles, packDbc } from "#test-support/dbc";
import { loadDisplayCatalog } from "#wow/areas/objects/display-catalog";

const FIELDS = 19;

function displayRow(id: number, bounds: readonly number[]): number[] {
  const row = new Array<number>(FIELDS).fill(0);
  row[0] = id;
  for (let i = 0; i < 6; i++) {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, bounds[i] ?? 0, true);
    row[12 + i] = view.getUint32(0, true);
  }
  return row;
}

describe("loadDisplayCatalog (src/server/shared/DataStores/DBCfmt.h:56)", () => {
  test("reads the shrine bounds of display 3011", async () => {
    const bytes = packDbc(FIELDS, [
      displayRow(3011, [-0.236, 0.0004, 0.083, 0.236, 0.4726, 0]),
    ]);
    const catalog = await loadDisplayCatalog(
      dbcFiles(new Map([["GameObjectDisplayInfo.dbc", bytes]])),
    );
    expect(catalog.get(3011)).toMatchObject({
      id: 3011,
      minX: expect.closeTo(-0.236, 4),
      maxX: expect.closeTo(0.236, 4),
    });
    expect(catalog.get(9)).toBeUndefined();
  });
});
