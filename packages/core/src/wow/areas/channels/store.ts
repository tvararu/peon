import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { ChannelNotice } from "#wow/areas/channels/notice";
import type {
  ChannelList,
  ChannelMember,
  ChannelMemberCount,
} from "#wow/areas/channels/protocol";
import type { SessionDeps } from "#wow/session-stores";

export type ChannelRow = {
  name: string;
  channelId: number;
  flags: number;
  selfFlags: number;
  joinedAt: number;
  owner: bigint | undefined;
  ownerName: string | undefined;
  members: readonly ChannelMember[] | undefined;
  memberCount: number | undefined;
};

export type PendingInvite = {
  channel: string;
  inviter: bigint;
  at: number;
};

export type ChannelsState = {
  channels: readonly ChannelRow[];
  pendingInvite: PendingInvite | undefined;
};

export type ChannelsEvent =
  | { type: "channel_notice"; notice: ChannelNotice }
  | {
      type: "channel_members";
      channel: string;
      flags: number;
      count: number;
      members: readonly ChannelMember[] | undefined;
    };

export const INVITE_VISIBLE_MS = 60_000;

export class ChannelStore {
  private readonly events = new Emitter<[ChannelsEvent]>();
  private readonly rows = new Map<string, ChannelRow>();
  private readonly now: () => number;
  private readonly selfGuid: () => bigint;
  private invite: PendingInvite | undefined;

  constructor(deps: SessionDeps, _core: unknown) {
    this.now = deps.now;
    this.selfGuid = deps.selfGuid;
  }

  snapshot(): ChannelsState {
    const invite = this.invite;
    return {
      channels: [...this.rows.values()],
      pendingInvite:
        invite !== undefined && this.now() - invite.at < INVITE_VISIBLE_MS
          ? invite
          : undefined,
    };
  }

  onEvent(cb: (event: ChannelsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  notice(notice: ChannelNotice): void {
    const key = notice.channel.toLowerCase();
    switch (notice.type) {
      case "you_joined":
        this.rows.set(key, {
          channelId: notice.channelId,
          flags: notice.flags,
          joinedAt: this.now(),
          memberCount: undefined,
          members: undefined,
          name: notice.channel,
          owner: undefined,
          ownerName: undefined,
          selfFlags: 0,
        });
        break;
      case "you_left":
        this.rows.delete(key);
        break;
      case "mode_change":
        this.applyModeChange(key, notice.guid, notice.newFlags);
        break;
      case "owner_changed":
        this.applyOwnerChange(key, notice.guid);
        break;
      case "channel_owner":
        this.applyOwnerName(key, notice.owner);
        break;
      case "invite":
        this.invite = {
          at: this.now(),
          channel: notice.channel,
          inviter: notice.inviter,
        };
        break;
      default:
        break;
    }
    this.events.emit({ type: "channel_notice", notice });
  }

  list(list: ChannelList): void {
    const row = this.rows.get(list.channel.toLowerCase());
    const members = list.members.map((member) => ({ ...member }));
    if (row !== undefined) {
      row.members = members;
      row.memberCount = members.length;
    }
    this.events.emit({
      channel: list.channel,
      count: members.length,
      flags: list.flags,
      members,
      type: "channel_members",
    });
  }

  count(count: ChannelMemberCount): void {
    const row = this.rows.get(count.channel.toLowerCase());
    if (row !== undefined) row.memberCount = count.count;
    this.events.emit({
      channel: count.channel,
      count: count.count,
      flags: count.flags,
      members: undefined,
      type: "channel_members",
    });
  }

  private applyModeChange(key: string, guid: bigint, flags: number): void {
    const row = this.rows.get(key);
    if (row !== undefined && guid === this.selfGuid()) row.selfFlags = flags;
  }

  private applyOwnerChange(key: string, owner: bigint): void {
    const row = this.rows.get(key);
    if (row === undefined) return;
    row.owner = owner;
    row.ownerName = undefined;
  }

  private applyOwnerName(key: string, owner: string): void {
    const row = this.rows.get(key);
    if (row !== undefined)
      row.ownerName = owner === "Nobody" ? undefined : owner;
  }

  has(channel: string): boolean {
    return this.rows.has(channel.toLowerCase());
  }

  dispose(): void {
    this.events.clear();
    this.rows.clear();
    this.invite = undefined;
  }
}
