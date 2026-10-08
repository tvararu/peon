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
  if (event.type === "transport_gone")
    return {
      class: "log",
      data: { guid: hex(event.guid) },
      name: "transport_gone",
      text: "A transport left view.",
    };
  if (event.type === "boarded")
    return {
      class: "log",
      data: { entry: event.entry, guid: hex(event.transport) },
      name: "boarded",
      text: "Boarded a transport.",
    };
  if (event.type === "left")
    return {
      class: "log",
      data: { guid: hex(event.transport) },
      name: "left",
      text: "Left a transport.",
    };
  return {
    class: "log",
    data: { entry: event.entry, fromMap: event.fromMap, toMap: event.toMap },
    name: "map_change",
    text: "Changed maps on a transport.",
  };
}

export const transportsHarness = defineHarnessArea({
  area: "transports",
  rules: () => ({
    event: (event) => [row(event)],
  }),
});
