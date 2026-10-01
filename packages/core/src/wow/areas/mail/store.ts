import { Emitter, type Unsubscribe } from "#lib/emitter";
import {
  MAIL_COPIED_FLAG,
  type MailEntry,
  type MailList,
  type NextMailTime,
  type SendMailResult,
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
  if (
    entity.objectType === ObjectType.GAMEOBJECT &&
    "gameObjectType" in entity
  ) {
    if (entity.gameObjectType === MAIL_GAMEOBJECT_TYPE) return "object";
    if ("bytes1" in entity)
      return ((entity.bytes1 >> 8) & 0xff) === MAIL_GAMEOBJECT_TYPE
        ? "object"
        : undefined;
    return undefined;
  }
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

export type MailPending =
  | { action: "send"; id: 0 }
  | { action: "money_taken"; id: number }
  | { action: "item_taken"; id: number }
  | { action: "returned_to_sender"; id: number }
  | { action: "deleted"; id: number }
  | { action: "made_permanent"; id: number };

export type MailState = {
  readonly mailbox: bigint | undefined;
  readonly inbox: readonly MailEntry[];
  readonly hidden: number;
  readonly unread: boolean;
  readonly senders: readonly MailSenders[];
  readonly newMail: boolean;
  readonly pending: MailPending | undefined;
  readonly lastResult: SendMailResult | undefined;
};

export type MailEvent =
  | { type: "listed"; inbox: readonly MailEntry[]; hidden: number }
  | { type: "next_time"; unread: boolean; senders: readonly MailSenders[] }
  | { type: "new_mail" }
  | { type: "mailbox_shown"; mailbox: bigint }
  | { type: "result"; result: SendMailResult };

export class MailStore {
  private readonly events = new Emitter<[MailEvent]>();
  private readonly deps: SessionDeps;
  private mailbox: bigint | undefined;
  private inbox: MailEntry[] = [];
  private hidden = 0;
  private unread = false;
  private senders: MailSenders[] = [];
  private newMail = false;
  private pending: MailPending | undefined;
  private lastResult: SendMailResult | undefined;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  entityOf: SessionDeps["getEntity"] = (guid) => this.deps.getEntity(guid);

  snapshot(): MailState {
    return {
      hidden: this.hidden,
      inbox: [...this.inbox],
      mailbox: this.mailbox,
      newMail: this.newMail,
      senders: [...this.senders],
      unread: this.unread,
      pending: this.pending,
      lastResult: this.lastResult,
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

  beginAction(pending: MailPending): void {
    if (this.pending) throw new Error("mail_busy");
    this.pending = pending;
  }

  releaseAction(): void {
    this.pending = undefined;
  }

  receiveSendMailResult(result: SendMailResult): void {
    this.lastResult = result;
    this.pending = undefined;
    if (result.status !== "ok") {
      this.events.emit({ result, type: "result" });
      return;
    }
    if (result.action === "send") {
      this.events.emit({ result, type: "result" });
      return;
    }
    const index = this.inbox.findIndex((mail) => mail.id === result.id);
    if (index < 0) {
      this.events.emit({ result, type: "result" });
      return;
    }
    const kept = [...this.inbox];
    const mail = kept[index];
    if (!mail) {
      this.events.emit({ result, type: "result" });
      return;
    }
    if (result.action === "money_taken") kept[index] = { ...mail, money: 0 };
    else if (result.action === "item_taken" && "itemLow" in result)
      kept[index] = {
        ...mail,
        items: mail.items.filter((item) => item.guidLow !== result.itemLow),
      };
    else if (result.action === "made_permanent")
      kept[index] = {
        ...mail,
        flags: {
          ...mail.flags,
          copied: true,
          raw: mail.flags.raw | MAIL_COPIED_FLAG,
        },
      };
    else kept.splice(index, 1);
    this.inbox = kept;
    this.events.emit({
      hidden: this.hidden,
      inbox: [...kept],
      type: "listed",
    });
    this.events.emit({ result, type: "result" });
  }

  dispose(): void {
    this.inbox = [];
    this.hidden = 0;
    this.unread = false;
    this.senders = [];
    this.newMail = false;
    this.mailbox = undefined;
    this.pending = undefined;
    this.lastResult = undefined;
    this.events.clear();
  }
}
