import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  GuildEventLogEntry,
  GuildInfo,
  GuildPermissions,
} from "#wow/areas/guildadmin/protocol";
import type {
  GuildEmblem,
  GuildMemberRaw,
  GuildRankRaw,
  GuildRosterRaw,
} from "#wow/protocol/guild";
import { GuildEventCode } from "#wow/protocol/guild";

export type GuildadminMember = Pick<
  GuildMemberRaw,
  "guid" | "name" | "rankIndex" | "publicNote" | "officerNote"
>;

export type GuildadminRoster = {
  motd: string;
  info: string;
  ranks: GuildRankRaw[];
  members: GuildadminMember[];
};

export type GuildadminState = {
  info: GuildInfo | undefined;
  disbanded: boolean;
  permissions: GuildPermissions | undefined;
  eventLog: GuildEventLogEntry[] | undefined;
  roster: GuildadminRoster | undefined;
  emblem: GuildEmblem | undefined;
};

export type GuildadminEvent =
  | { type: "info"; info: GuildInfo }
  | { type: "disbanded" }
  | { type: "permissions"; permissions: GuildPermissions }
  | { type: "event_log"; entries: GuildEventLogEntry[] }
  | { type: "roster"; roster: GuildadminRoster }
  | { type: "emblem"; emblem: GuildEmblem }
  | { type: "emblem_result"; code: number }
  | { type: "tabard_vendor"; npc: bigint }
  | { type: "rank_updated"; rank: number; name: string; count: number }
  | { type: "rank_deleted"; count: number }
  | { type: "command_error"; command: number; name: string; result: number };

function detach(info: GuildInfo): GuildInfo {
  return { ...info, created: { ...info.created } };
}

function detachPermissions(p: GuildPermissions): GuildPermissions {
  return { ...p, tabs: p.tabs.map((tab) => ({ ...tab })) };
}

function detachRoster(r: GuildadminRoster): GuildadminRoster {
  return {
    ...r,
    members: r.members.map((m) => ({ ...m })),
    ranks: r.ranks.map((rank) => ({
      ...rank,
      tabs: rank.tabs.map((tab) => ({ ...tab })),
    })),
  };
}

function toRoster(raw: GuildRosterRaw): GuildadminRoster {
  return {
    motd: raw.motd,
    info: raw.guildInfo,
    ranks: raw.ranks,
    members: raw.members.map((m) => ({
      guid: m.guid,
      name: m.name,
      rankIndex: m.rankIndex,
      publicNote: m.publicNote,
      officerNote: m.officerNote,
    })),
  };
}

export class GuildadminStore {
  private readonly events = new Emitter<[GuildadminEvent]>();
  private infoState: GuildInfo | undefined;
  private disbandedState = false;
  private permissionsState: GuildPermissions | undefined;
  private eventLogState: GuildEventLogEntry[] | undefined;
  private rosterState: GuildadminRoster | undefined;
  private emblemState: GuildEmblem | undefined;
  private ranksKnown: number | undefined;

  snapshot(): GuildadminState {
    return {
      info: this.infoState && detach(this.infoState),
      disbanded: this.disbandedState,
      permissions:
        this.permissionsState && detachPermissions(this.permissionsState),
      eventLog: this.eventLogState?.map((e) => ({ ...e })),
      roster: this.rosterState && detachRoster(this.rosterState),
      emblem: this.emblemState && { ...this.emblemState },
    };
  }

  onEvent(cb: (event: GuildadminEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveInfo(info: GuildInfo): void {
    this.infoState = detach(info);
    this.events.emit({ type: "info", info: detach(info) });
  }

  rankCount(): number | undefined {
    return this.ranksKnown;
  }

  receiveGuildEvent(code: number, params: readonly string[] = []): void {
    if (code === GuildEventCode.RANK_UPDATED) {
      this.ranksKnown = Number(params[2]);
      this.events.emit({
        type: "rank_updated",
        rank: Number(params[0]),
        name: params[1] ?? "",
        count: Number(params[2]),
      });
      return;
    }
    if (code === GuildEventCode.RANK_DELETED) {
      this.ranksKnown = Number(params[0]);
      this.events.emit({ type: "rank_deleted", count: Number(params[0]) });
      return;
    }
    if (code !== GuildEventCode.DISBANDED || this.disbandedState) return;
    this.disbandedState = true;
    this.events.emit({ type: "disbanded" });
  }

  receivePermissions(permissions: GuildPermissions): void {
    this.permissionsState = detachPermissions(permissions);
    this.events.emit({
      type: "permissions",
      permissions: detachPermissions(permissions),
    });
  }

  receiveEventLog(entries: GuildEventLogEntry[]): void {
    this.eventLogState = entries.map((e) => ({ ...e }));
    this.events.emit({
      type: "event_log",
      entries: entries.map((e) => ({ ...e })),
    });
  }

  receiveRoster(raw: GuildRosterRaw): void {
    const roster = toRoster(raw);
    this.ranksKnown = roster.ranks.length;
    this.rosterState = detachRoster(roster);
    this.events.emit({ type: "roster", roster: detachRoster(roster) });
  }

  receiveEmblem(emblem: GuildEmblem): void {
    this.emblemState = { ...emblem };
    this.events.emit({ type: "emblem", emblem: { ...emblem } });
  }

  receiveEmblemResult(code: number): void {
    this.events.emit({ type: "emblem_result", code });
  }

  receiveTabardVendor(npc: bigint): void {
    this.events.emit({ type: "tabard_vendor", npc });
  }

  receiveCommandResult(command: number, name: string, result: number): void {
    if (result === 0) return;
    this.events.emit({ type: "command_error", command, name, result });
  }

  dispose(): void {
    this.events.clear();
  }
}
