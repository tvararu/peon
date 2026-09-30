import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  MailEntry,
  MailList,
  NextMailTime,
} from "#wow/areas/mail/protocol";
import type { Entity } from "#wow/entity-store";
import { distance } from "#wow/geometry";
import { ObjectType } from "#wow/protocol/entity-fields";
import type { SessionDeps } from "#wow/session-stores";

export const MAIL_GAMEOBJECT_TYPE = 19;
export const MAIL_NPC_FLAG = 0x4_00_00_00;
export const MAIL_OBJECT_YARDS = 10;
export const MAIL_CREATURE_YARDS = 5.5;

export type MailboxReach =
  | { kind: "object"; distance: number }
  | { kind: "creature"; distance: number };

export function mailboxKind(entity: Entity): "object" | "creature" | undefined {
  if (entity.objectType === ObjectType.GAMEOBJECT && "gameObjectType" in entity)
    return entity.gameObjectType === MAIL_GAMEOBJECT_TYPE
      ? "object"
      : undefined;
  const unit =
    entity.objectType === ObjectType.UNIT ||
    entity.objectType === ObjectType.PLAYER;
  if (!(unit && "npcFlags" in entity)) return undefined;
  return (entity.npcFlags & MAIL_NPC_FLAG) === 0 ? undefined : "creature";
}

export type MailSenders = {
  readonly guid: bigint;
  readonly entry: number;
  readonly type: number;
  readonly stationery: number;
  readonly delay: number;
};

export type MailState = {
  readonly mailbox: bigint | undefined;
  readonly inbox: readonly MailEntry[];
  readonly hidden: number;
  readonly unread: boolean;
  readonly senders: readonly MailSenders[];
  readonly newMail: boolean;
};

export type MailEvent =
  | { type: "listed"; inbox: readonly MailEntry[]; hidden: number }
  | { type: "next_time"; unread: boolean; senders: readonly MailSenders[] }
  | { type: "new_mail" }
  | { type: "mailbox_shown"; mailbox: bigint };

export class MailStore {
  private readonly events = new Emitter<[MailEvent]>();
  private readonly deps: SessionDeps;
  private mailbox: bigint | undefined;
  private inbox: MailEntry[] = [];
  private hidden = 0;
  private unread = false;
  private senders: MailSenders[] = [];
  private newMail = false;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  snapshot(): MailState {
    return {
      hidden: this.hidden,
      inbox: [...this.inbox],
      mailbox: this.mailbox,
      newMail: this.newMail,
      senders: [...this.senders],
      unread: this.unread,
    };
  }

  onEvent(cb: (event: MailEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  reach(mailbox: bigint): MailboxReach | undefined {
    const box = this.deps.getEntity(mailbox);
    const self = this.deps.getEntity(this.deps.selfGuid());
    const from = self?.position;
    const to = box?.position;
    if (!(box && from && to)) return undefined;
    const kind = mailboxKind(box);
    if (!kind) return undefined;
    const yards = distance(
      { x: from.x, y: from.y, z: from.z },
      { x: to.x, y: to.y, z: to.z },
    );
    return { distance: yards, kind };
  }

  openMailbox(mailbox: bigint): void {
    this.mailbox = mailbox;
  }

  receiveList(list: MailList): void {
    this.inbox = [...list.mails];
    this.hidden = list.hidden;
    this.newMail = false;
    this.events.emit({
      hidden: list.hidden,
      inbox: [...list.mails],
      type: "listed",
    });
  }

  receiveNextMailTime(next: NextMailTime): void {
    this.unread = next.unread;
    this.senders = [...next.senders];
    this.events.emit({
      senders: [...next.senders],
      type: "next_time",
      unread: next.unread,
    });
  }

  receiveReceivedMail(): void {
    this.newMail = true;
    this.events.emit({ type: "new_mail" });
  }

  receiveMailboxShown(mailbox: bigint): void {
    this.mailbox = mailbox;
    this.events.emit({ mailbox, type: "mailbox_shown" });
  }

  dispose(): void {
    this.inbox = [];
    this.hidden = 0;
    this.unread = false;
    this.senders = [];
    this.newMail = false;
    this.mailbox = undefined;
    this.events.clear();
  }
}
