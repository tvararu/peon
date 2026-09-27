import { expect, test } from "bun:test";
import * as fields from "#wow/protocol/update-fields";
import previous from "../../../test-support/previous-update-fields.json" with {
  type: "json",
};

type Tables = Record<string, Record<string, { offset: number; size: number }>>;

test("keeps the offset and size of every field declared before generation", () => {
  const tables = fields as unknown as Tables;
  const moved = Object.entries(previous).flatMap(([table, rows]) =>
    Object.entries(rows)
      .filter(([name, def]) => {
        const now = tables[table]?.[name];
        return now?.offset !== def.offset || now.size !== def.size;
      })
      .map(([name]) => `${table}.${name}`),
  );
  expect(moved).toEqual([]);
});
