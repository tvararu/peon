import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { captureFrame, tagFrame } from "#harness/grader/frames";
import { nerd } from "#harness/ui/glyphs";
import { fakePane } from "#test-support/fake-pane";

describe("tagFrame", () => {
  test("names every nerd glyph and keeps other text", () => {
    expect(
      tagFrame(`${nerd.hostile} Springpaw Stalker 12yd ${nerd.health} 80%`),
    ).toBe("<hostile> Springpaw Stalker 12yd <health> 80%");
  });

  test("leaves plain text as it is", () => {
    expect(tagFrame("── Working ──")).toBe("── Working ──");
  });
});

describe("captureFrame", () => {
  test("saves a changed screen as <seq>-<ms>.txt", async () => {
    const dir = await mkdtemp(`${tmpdir()}/frames-`);
    const frame = await captureFrame({
      dir,
      last: undefined,
      now: 1_727_384_400_000,
      pane: fakePane([`${nerd.self} you`]),
      seq: 3,
    });
    expect(frame).toEqual({
      at: 1_727_384_400_000,
      file: `${dir}/00003-1727384400000.txt`,
      seq: 3,
      text: "<self> you",
    });
    expect(await Bun.file(`${dir}/00003-1727384400000.txt`).text()).toBe(
      "<self> you",
    );
  });

  test("skips a screen equal to the last frame", async () => {
    const dir = await mkdtemp(`${tmpdir()}/frames-`);
    const frame = await captureFrame({
      dir,
      last: "<self> you",
      now: 5,
      pane: fakePane([`${nerd.self} you`]),
      seq: 4,
    });
    expect(frame).toBeUndefined();
    expect(await readdir(dir)).toEqual([]);
  });
});
