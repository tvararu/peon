import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { createWorldService, type WorldRuntime } from "#harness/world/hub";
import { WORLD_READY, WORLD_REQUEST } from "#harness/world/service";

export function worldExtension(rt: WorldRuntime): ExtensionFactory {
  return (pi) => {
    const world = createWorldService(rt);
    const offRequest = pi.events.on(WORLD_REQUEST, (reply) => {
      if (typeof reply === "function") reply(world.service);
    });
    pi.on("session_shutdown", () => {
      offRequest();
      world.dispose();
    });
    pi.events.emit(WORLD_READY, world.service);
  };
}
