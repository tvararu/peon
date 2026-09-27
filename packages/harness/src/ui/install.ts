import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Capabilities } from "@tuicraft/core";
import type {
  GameLogEntry,
  HumanLineDetails,
  WowEventDetails,
} from "#harness/contract/log";
import type { HarnessRuntime } from "#harness/contract/services";
import type { NowSnapshot } from "#harness/contract/views";
import { nowSnapshot } from "#harness/ops/views";
import { renderEventCard, renderHumanLine } from "#harness/ui/cards";
import { glyphSetName } from "#harness/ui/context";
import { createFooter, type FooterChrome } from "#harness/ui/footer";
import { titleFor, workingMessage } from "#harness/ui/status-line";
import { createTicker } from "#harness/ui/ticker";

export type FooterMount = "footer" | "widget";
export type Factory = (tui: TUI, theme: Theme) => Component;

type Hud = {
  snapshot: () => NowSnapshot | undefined;
  refresh: () => void;
  kills: () => number;
  xp: () => number;
  dispose: () => void;
};
type MountInit = {
  pi: ExtensionAPI;
  rt: HarnessRuntime;
  ctx: ExtensionContext;
};

export const REPAINT_GAP_MS = 100;
export const TICK_MS = 1000;

const FOOTER_MOUNT: FooterMount = "footer";

const CHIPS = [
  ["jev", "jev"],
  ["navigation", "nav"],
  ["factions", "factions"],
  ["spells", "spells"],
] as const;

function missingOf(
  capabilities: Capabilities | undefined,
): FooterChrome["missing"] {
  if (!capabilities) return [];
  return CHIPS.filter(([key]) => !capabilities[key]).map(([, chip]) => chip);
}

function footerChrome({ pi, rt, ctx }: MountInit): FooterChrome {
  return {
    connection: rt.connection(),
    contextPct: ctx.getContextUsage()?.percent ?? undefined,
    glyphSet: glyphSetName(),
    logRows: rt.log.count(),
    missing: missingOf(rt.ready.inWorld()?.capabilities),
    model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : rt.flags.model,
    thinking: pi.getThinkingLevel(),
    unreadWhispers: rt.session.unreadWhispers,
    wake: rt.session.wake,
  };
}

function createHud(rt: HarnessRuntime): Hud {
  let snapshot = nowSnapshot(rt);
  let kills = 0;
  let xp = 0;
  const count = (entry: GameLogEntry) => {
    const amount = entry.data["amount"];
    if (entry.event === "combat/kill_credit") kills += 1;
    if (entry.event === "xp/gain" && typeof amount === "number") xp += amount;
  };
  const dispose = rt.log.subscribe(count);
  const refresh = () => {
    snapshot = nowSnapshot(rt);
  };
  return {
    dispose,
    kills: () => kills,
    refresh,
    snapshot: () => snapshot,
    xp: () => xp,
  };
}

function createRepaint(paint: () => void): {
  request: () => void;
  dispose: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    timer = undefined;
    paint();
  };
  const request = () => {
    timer ??= setTimeout(run, REPAINT_GAP_MS);
  };
  return { dispose: () => clearTimeout(timer), request };
}

export function mountFooter(
  ui: ExtensionUIContext,
  factory: Factory,
  mount: FooterMount,
): void {
  if (mount === "widget") {
    ui.setWidget("wow-footer", factory, { placement: "belowEditor" });
    return;
  }
  ui.setFooter(factory);
}

function mountUi(init: MountInit): () => void {
  const { rt, ctx } = init;
  const hud = createHud(rt);
  const tuis = new Set<TUI>();
  const track =
    (factory: Factory): Factory =>
    (tui, theme) => {
      tuis.add(tui);
      return factory(tui, theme);
    };
  const paint = () => {
    hud.refresh();
    ctx.ui.setTitle(titleFor(hud.snapshot()));
    ctx.ui.setWorkingMessage(workingMessage(hud.snapshot()?.run));
    for (const tui of tuis) tui.requestRender();
  };
  const repaint = createRepaint(paint);
  const unsubscribe = rt.log.subscribe(repaint.request);
  const tick = setInterval(repaint.request, TICK_MS);
  const footer = createFooter({
    chrome: () => footerChrome(init),
    snapshot: hud.snapshot,
  });
  const ticker = createTicker({
    kills: hud.kills,
    now: () => rt.clock.now(),
    recent: (n) => rt.log.recent(n),
    run: () => hud.snapshot()?.run,
    xp: hud.xp,
  });
  mountFooter(ctx.ui, track(footer), FOOTER_MOUNT);
  ctx.ui.setWidget("wow-ticker", track(ticker), { placement: "aboveEditor" });
  paint();
  return () => {
    unsubscribe();
    clearInterval(tick);
    repaint.dispose();
    hud.dispose();
    tuis.clear();
  };
}

export function installUi(pi: ExtensionAPI, rt: HarnessRuntime): void {
  pi.registerMessageRenderer<WowEventDetails>("wow-event", renderEventCard);
  pi.registerEntryRenderer<HumanLineDetails>("wow-human", renderHumanLine);
  let unmount: (() => void) | undefined;
  pi.on("session_start", (_event, ctx) => {
    unmount?.();
    unmount = ctx.mode === "tui" ? mountUi({ ctx, pi, rt }) : undefined;
  });
  pi.on("session_shutdown", () => {
    unmount?.();
    unmount = undefined;
  });
}
