import { describe, expect, test } from "bun:test";
import { guardHarness } from "#harness/areas/guard/area";

describe("guard harness area", () => {
  test("a warden request drafts one log row that says Peon stays silent", () => {
    const rows = guardHarness
      .rules?.()
      .event?.({ size: 20, type: "warden_request" } as never, {} as never);
    expect(rows).toEqual([
      {
        class: "log",
        data: { size: 20 },
        name: "warden",
        text: "The server asked for the anti-cheat module. Peon does not answer it.",
      },
    ]);
  });

  test("the other guard events draft nothing", () => {
    const event = guardHarness.rules?.().event;
    expect(
      event?.({ ok: true, type: "redirect_ready" } as never, {} as never),
    ).toEqual([]);
    expect(
      event?.({ text: "x", type: "notification" } as never, {} as never),
    ).toEqual([]);
  });
});
