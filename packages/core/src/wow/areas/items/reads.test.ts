import { describe, expect, test } from "bun:test";
import { type ReadRequest, ReadSlice } from "#wow/areas/items/reads";

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
