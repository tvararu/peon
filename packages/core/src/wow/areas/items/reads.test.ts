import { describe, expect, test } from "bun:test";
import { NameSlice, type ReadRequest, ReadSlice } from "#wow/areas/items/reads";

const LETTER = 0x40_00_00_00_00_00_00_05n;
const TOME = 0x40_00_00_00_00_00_00_06n;

const read: ReadRequest = {
  kind: "read",
  itemGuid: LETTER,
  entry: 889,
  from: { bag: 255, slot: 24 },
  requestedAt: 10,
};

describe("ReadSlice requests", () => {
  test("a pending read claims its item and settles once", () => {
    const slice = new ReadSlice();
    expect(slice.claim()).toBeUndefined();
    slice.begin(read);
    expect(slice.claim()).toEqual({ itemGuid: LETTER });
    expect(slice.settle("ok", undefined, 50)).toBe(read);
    expect(slice.settle("failed", "late", 60)).toBeUndefined();
    expect(slice.snapshot()).toEqual({
      last: { observedAt: 50, reason: undefined, request: read, status: "ok" },
      pending: undefined,
      texts: [],
    });
  });

  test("begin clears the last outcome", () => {
    const slice = new ReadSlice();
    slice.begin(read);
    slice.settle("unanswered", "server_unanswered", 20);
    slice.begin({ ...read, kind: "open" });
    expect(slice.snapshot().last).toBeUndefined();
    expect(slice.request?.kind).toBe("open");
  });
});

describe("ReadSlice item text", () => {
  test("one query per guid, answered by guid and cached", async () => {
    const slice = new ReadSlice();
    const first = slice.awaitText(LETTER);
    const again = slice.awaitText(LETTER);
    expect(first.first).toBe(true);
    expect(again.first).toBe(false);
    expect(
      slice.receiveText({ found: true, guid: LETTER, text: "Dear Mother" }),
    ).toEqual({ guid: LETTER, text: "Dear Mother" });
    expect(await first.promise).toBe("Dear Mother");
    expect(await again.promise).toBe("Dear Mother");
    expect(slice.text(LETTER)).toBe("Dear Mother");
    expect(slice.snapshot().texts).toEqual([
      { guid: LETTER, text: "Dear Mother" },
    ]);
  });

  test("an answer with no guid settles the oldest query as not found", async () => {
    const slice = new ReadSlice();
    const letter = slice.awaitText(LETTER);
    const tome = slice.awaitText(TOME);
    expect(slice.receiveText({ found: false })).toBeUndefined();
    expect(await letter.promise).toBeUndefined();
    slice.receiveText({ found: true, guid: TOME, text: "" });
    expect(await tome.promise).toBe("");
    expect(slice.text(LETTER)).toBeUndefined();
    expect(slice.text(TOME)).toBe("");
  });

  test("a dropped query no longer takes an answer", async () => {
    const slice = new ReadSlice();
    slice.awaitText(LETTER);
    slice.dropText(LETTER);
    const tome = slice.awaitText(TOME);
    slice.receiveText({ found: false });
    expect(await tome.promise).toBeUndefined();
    expect(slice.awaitText(LETTER).first).toBe(true);
  });

  test("clear settles every waiting query and forgets the cache", async () => {
    const slice = new ReadSlice();
    slice.receiveText({ found: true, guid: TOME, text: "x" });
    const letter = slice.awaitText(LETTER);
    slice.clear();
    expect(await letter.promise).toBeUndefined();
    expect(slice.snapshot().texts).toEqual([]);
  });
});

const FANG = { entry: 6473, inventoryType: 5, name: "Armor of the Fang" };

describe("NameSlice set-item names", () => {
  test("one query per entry; the reply fills every waiter and the cache", async () => {
    const slice = new NameSlice();
    const first = slice.await(FANG.entry);
    const again = slice.await(FANG.entry);
    expect(first.first).toBe(true);
    expect(again.first).toBe(false);
    expect(slice.receive(FANG)).toEqual(FANG);
    expect(await first.promise).toEqual(FANG);
    expect(await again.promise).toEqual(FANG);
    expect(slice.get(FANG.entry)).toEqual(FANG);
  });

  test("the first reply wins and a repeat is not news", () => {
    const slice = new NameSlice();
    slice.receive(FANG);
    expect(slice.receive({ ...FANG, name: "Other" })).toBeUndefined();
    expect(slice.get(FANG.entry)?.name).toBe("Armor of the Fang");
  });

  test("expire settles waiters empty once and remembers the miss", async () => {
    const slice = new NameSlice();
    const wait = slice.await(25);
    expect(slice.expire(25)).toBe(true);
    expect(await wait.promise).toBeUndefined();
    expect(slice.expire(25)).toBe(false);
    const later = slice.await(25);
    expect(later.first).toBe(false);
    expect(await later.promise).toBeUndefined();
  });

  test("a late reply overrides a remembered miss", async () => {
    const slice = new NameSlice();
    slice.await(FANG.entry);
    slice.expire(FANG.entry);
    expect(slice.receive(FANG)).toEqual(FANG);
    expect(slice.get(FANG.entry)).toEqual(FANG);
  });

  test("drop and clear release waiters without remembering a miss", async () => {
    const slice = new NameSlice();
    const dropped = slice.await(1);
    const kept = slice.await(2);
    slice.drop(1);
    expect(await dropped.promise).toBeUndefined();
    expect(slice.await(1).first).toBe(true);
    slice.clear();
    expect(await kept.promise).toBeUndefined();
    expect(slice.await(2).first).toBe(true);
  });
});
