import type {
  ExtensionContext,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import type { DriveTimers } from "#harness/drive/held";
import { Play } from "#harness/drive/play";
import { onWorld, type WorldService } from "#harness/world/service";

export const HUMAN_DRIVE = "wow-human-drive";

export const REAL_TIMERS: DriveTimers = {
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
  set: (cb, ms) => setTimeout(cb, ms),
};

export function driveExtension(
  timers: DriveTimers = REAL_TIMERS,
): ExtensionFactory {
  return (pi) => {
    let world: WorldService | undefined;
    let ctx: ExtensionContext | undefined;
    let offInput: (() => void) | undefined;
    const offWorld = onWorld(pi, (service) => {
      world = service;
    });
    const play = new Play({
      abort: () => ctx?.abort(),
      busy: () => (ctx ? !ctx.isIdle() : false),
      handBack: (note) =>
        pi.sendMessage(
          { content: note, customType: HUMAN_DRIVE, display: true },
          { deliverAs: "nextTurn" },
        ),
      timers,
      ui: () => ctx?.ui,
      world: () => world,
    });
    pi.on("session_start", (_event, started) => {
      if (!started.hasUI) return;
      ctx = started;
      offInput?.();
      offInput = started.ui.onTerminalInput((data) => play.input(data));
    });
    pi.on("session_shutdown", () => {
      offInput?.();
      offWorld();
      play.dispose();
      ctx = undefined;
    });
  };
}
