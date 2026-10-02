import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { GuildInfo } from "#wow/areas/guildadmin/protocol";

export type GuildadminState = {
  info: GuildInfo | undefined;
  disbanded: boolean;
};

export type GuildadminEvent =
  | { type: "info"; info: GuildInfo }
  | {
      type: "disbanded";
    };

export class GuildadminStore {
  private readonly events = new Emitter<[GuildadminEvent]>();
  private infoState: GuildInfo | undefined;
  private disbandedState = false;

  snapshot(): GuildadminState {
    return {
      info: this.infoState && {
        ...this.infoState,
        created: { ...this.infoState.created },
      },
      disbanded: this.disbandedState,
    };
  }

  onEvent(cb: (event: GuildadminEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveInfo(info: GuildInfo): void {
    this.infoState = { ...info, created: { ...info.created } };
    this.events.emit({ type: "info", info: this.snapshot().info as GuildInfo });
  }

  receiveGuildEvent(code: number): void {
    if (code !== 8 || this.disbandedState) return;
    this.disbandedState = true;
    this.events.emit({ type: "disbanded" });
  }

  dispose(): void {
    this.events.clear();
  }
}
