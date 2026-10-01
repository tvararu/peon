import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

type TransportsEvent = AreaEventOf<"transports">;

function hex(guid: bigint): string {
  return `0x${guid.toString(16)}`;
}

function row(event: TransportsEvent): AreaDraft {
  if (event.type === "transport_seen")
    return {
      class: "log",
      data: { guid: hex(event.guid) },
      name: "transport_seen",
      text: "A transport came into view.",
    };
  return {
    class: "log",
    data: { guid: hex(event.guid) },
    name: "transport_gone",
    text: "A transport left view.",
  };
}

export const transportsHarness = defineHarnessArea({
  area: "transports",
  rules: () => ({
    event: (event) => [row(event)],
  }),
  worldActs: ["poseAt", "dataStatus"],
});
