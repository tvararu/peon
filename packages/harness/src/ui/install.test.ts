import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { FOOTER_ROWS } from "#harness/ui/footer";
import { nerd } from "#harness/ui/glyphs";
import {
  type Factory,
  installUi,
  mountFooter,
  REPAINT_GAP_MS,
  TICK_MS,
} from "#harness/ui/install";
import { TICKER_ROWS } from "#harness/ui/ticker";
import {
  createFakeTui,
  createPiRecorder,
  createUiRecorder,
  recorderContext,
  type UiRecorder,
} from "#test-support/pi-recorder";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { plain, testTheme } from "#test-support/ui-fixture";

const theme = testTheme();

async function mounted(mode: "tui" | "rpc" = "tui") {
  const { rt } = await createTestRuntime();
  const fake = createPiRecorder();
  installUi(fake.pi, rt);
  const ui = createUiRecorder();
  const ctx = recorderContext({ contextPct: 14, mode, ui: ui.ui });
  await fake.fire(
    "session_start",
    { reason: "startup", type: "session_start" },
    ctx,
  );
  return { ctx, fake, rt, ui };
}

function asFactory(value: unknown): Factory {
  if (typeof value !== "function") throw new Error("no factory");
  return value as Factory;
}

function widget(ui: UiRecorder, key: string): Factory {
  const call = ui.named("setWidget").find((args) => args[0] === key);
  return asFactory(call?.[1]);
}

function footerOf(ui: UiRecorder): Factory {
  const call = ui.named("setFooter")[0];
  return call ? asFactory(call[0]) : widget(ui, "wow-footer");
}

function mount(factory: Factory): {
  component: Component;
  tui: TUI;
  renders: () => number;
} {
  const { tui, renders } = createFakeTui();
  return { component: factory(tui, theme), renders, tui };
}

describe("installUi", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("registers the event card and human line renderers", async () => {
    const { fake } = await mounted("rpc");
    expect(fake.messageRenderers.has("wow-event")).toBe(true);
    expect(fake.entryRenderers.has("wow-human")).toBe(true);
  });

  test("outside the TUI it makes no UI call", async () => {
    const { ui } = await mounted("rpc");
    expect(ui.calls).toEqual([]);
  });

  test("mounts a 4-row footer and a 6-row ticker above the editor", async () => {
    const { ui } = await mounted();
    const footer = mount(footerOf(ui)).component;
    const ticker = mount(widget(ui, "wow-ticker")).component;
    const options = ui
      .named("setWidget")
      .find((args) => args[0] === "wow-ticker")?.[2];
    expect(footer.render(120)).toHaveLength(FOOTER_ROWS);
    expect(ticker.render(120)).toHaveLength(TICKER_ROWS);
    expect(options).toEqual({ placement: "aboveEditor" });
  });

  test("sets the tab title and the working message on mount", async () => {
    const { ui } = await mounted();
    expect(ui.named("setTitle")).toEqual([["Testchar L0 0%"]]);
    expect(ui.named("setWorkingMessage")).toEqual([["Work, work…"]]);
  });

  test("log appends repaint at most once per 100 ms", async () => {
    const { rt, ui } = await mounted();
    const { renders } = mount(footerOf(ui));
    for (let i = 0; i < 5; i += 1)
      rt.log.append({
        class: "log",
        data: {},
        domain: "xp",
        event: "xp/gain",
        text: `xp ${i}`,
      });
    expect(renders()).toBe(0);
    jest.advanceTimersByTime(REPAINT_GAP_MS);
    expect(renders()).toBe(1);
    expect(ui.named("setTitle")).toHaveLength(2);
  });

  test("a 1 s tick repaints while nothing happens", async () => {
    const { ui } = await mounted();
    const { renders } = mount(footerOf(ui));
    jest.advanceTimersByTime(TICK_MS + REPAINT_GAP_MS);
    expect(renders()).toBe(1);
  });

  test("kills and XP from the log reach the ticker head", async () => {
    const { rt, ui } = await mounted();
    const ticker = mount(widget(ui, "wow-ticker")).component;
    rt.log.append({
      class: "log",
      data: { name: "Springpaw Stalker" },
      domain: "combat",
      event: "combat/kill_credit",
      text: "Springpaw Stalker killed",
    });
    rt.log.append({
      class: "log",
      data: { amount: 84 },
      domain: "xp",
      event: "xp/gain",
      text: "+84 xp",
    });
    expect(plain(ticker.render(160))[0]).toContain(
      `${nerd.kill} 1 kill ${nerd.xp} +84 xp`,
    );
  });

  test("session_shutdown stops the timers", async () => {
    const { ctx, fake, ui } = await mounted();
    const { renders } = mount(footerOf(ui));
    await fake.fire(
      "session_shutdown",
      { reason: "quit", type: "session_shutdown" },
      ctx,
    );
    jest.advanceTimersByTime(5 * TICK_MS);
    expect(renders()).toBe(0);
  });
});

describe("mountFooter", () => {
  test("the V5 fallback puts the footer in a widget below the editor", () => {
    const ui = createUiRecorder();
    const factory: Factory = () => ({
      invalidate: () => undefined,
      render: () => [],
    });
    mountFooter(ui.ui, factory, "widget");
    expect(ui.named("setWidget")).toEqual([
      ["wow-footer", factory, { placement: "belowEditor" }],
    ]);
    mountFooter(ui.ui, factory, "footer");
    expect(ui.named("setFooter")).toEqual([[factory]]);
  });
});
