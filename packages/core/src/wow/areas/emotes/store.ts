import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { EmotePacket, TextEmotePacket } from "#wow/areas/emotes/protocol";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type EmoteState = { guid: bigint; state: number };
export type EmotesState = { emoteStates: readonly EmoteState[] };
export type EmotesEvent =
  | { type: "emote"; guid: bigint; emote: number }
  | {
      type: "text_emote";
      guid: bigint;
      self: boolean;
      textEmote: number;
      emoteNum: number;
      target: string | undefined;
    };

export class EmoteStore {
  private readonly events = new Emitter<[EmotesEvent]>();
  private readonly states = new Map<bigint, number>();
  private readonly selfGuid: () => bigint;

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.selfGuid = deps.selfGuid;
  }

  snapshot(): EmotesState {
    return {
      emoteStates: [...this.states].map(([guid, state]) => ({ guid, state })),
    };
  }

  onEvent(cb: (event: EmotesEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  emote(packet: EmotePacket): void {
    this.events.emit({ type: "emote", guid: packet.guid, emote: packet.emote });
  }

  textEmote(packet: TextEmotePacket): void {
    this.events.emit({
      type: "text_emote",
      guid: packet.guid,
      self: packet.guid === this.selfGuid(),
      textEmote: packet.textEmote,
      emoteNum: packet.emoteNum,
      target: packet.target === "" ? undefined : packet.target,
    });
  }

  setEmoteState(guid: bigint, state: number | undefined): void {
    if (state) this.states.set(guid, state);
    else this.states.delete(guid);
  }

  forget(guid: bigint): void {
    this.states.delete(guid);
  }

  dispose(): void {
    this.events.clear();
    this.states.clear();
  }
}
