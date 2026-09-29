import type {
  GossipPoi,
  NpcText,
  NpcTextOption,
} from "#wow/areas/quests/protocol";

export type NpcTextStatus = "pending" | "known" | "no_reply";
export type NpcTextEntry = {
  status: NpcTextStatus;
  options: NpcTextOption[];
  guid: bigint | undefined;
  at: number;
};
export type NpcTexts = ReadonlyMap<number, NpcTextEntry>;
export type GossipPoiEntry = GossipPoi & {
  at: number;
  from: bigint | undefined;
};
export type NpcTextChange =
  | { type: "npc_text"; textId: number; status: NpcTextStatus }
  | { type: "gossip_poi"; from: bigint | undefined; name: string };

export function greetingOf(
  entry: NpcTextEntry | undefined,
): string | undefined {
  if (entry?.status !== "known") return undefined;
  let best: NpcTextOption | undefined;
  for (const option of entry.options) {
    const text = option.text0 || option.text1;
    if (text === "") continue;
    if (!best || option.probability > best.probability) best = option;
  }
  if (!best) return undefined;
  return best.text0 === "" ? best.text1 : best.text0;
}

export function requestText(
  texts: NpcTexts,
  textId: number,
  guid: bigint,
  at: number,
): { texts: NpcTexts; send: boolean } {
  if (texts.has(textId)) return { texts, send: false };
  const next = new Map(texts);
  next.set(textId, { status: "pending", options: [], guid, at });
  return { texts: next, send: true };
}

export function receiveText(
  texts: NpcTexts,
  text: NpcText,
  guid: bigint | undefined,
  at: number,
): { texts: NpcTexts; change: NpcTextChange } {
  const next = new Map(texts);
  next.set(text.textId, { status: "known", options: text.options, guid, at });
  return {
    texts: next,
    change: { type: "npc_text", textId: text.textId, status: "known" },
  };
}

export function textNoReply(
  texts: NpcTexts,
  textId: number,
  at: number,
): { texts: NpcTexts; change: NpcTextChange } {
  const entry = texts.get(textId);
  const next = new Map(texts);
  if (entry) next.set(textId, { ...entry, status: "no_reply", at });
  return {
    texts: next,
    change: { type: "npc_text", textId, status: "no_reply" },
  };
}

export function receivePoi(
  poi: GossipPoi,
  from: bigint | undefined,
  at: number,
): { entry: GossipPoiEntry; change: NpcTextChange } {
  return {
    entry: { ...poi, at, from },
    change: { type: "gossip_poi", from, name: poi.name },
  };
}
