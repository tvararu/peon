import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Claim, WorldService } from "#harness/world/service";

export type ProbeStep = {
  pose: unknown;
  outcome: string;
};

export default function worldProbe(pi: ExtensionAPI): void {
  let world: WorldService | undefined;
  let claim: Claim | undefined;
  const take = (data: unknown) => {
    world ??= data as WorldService;
  };
  pi.events.on("peon:world/1:ready", take);
  pi.events.emit("peon:world/1:request", take);
  pi.events.on("probe:step", async (reply) => {
    if (!world || typeof reply !== "function") return;
    claim ??= world.claim("loop", "probe");
    const pose = world.current()?.reads.getControlState().pose;
    const outcome = claim
      ? await claim.act.move("forward", 2000).then(
          () => "sent",
          (error: Error) => error.message,
        )
      : "refused";
    reply({ outcome, pose } satisfies ProbeStep);
  });
}
