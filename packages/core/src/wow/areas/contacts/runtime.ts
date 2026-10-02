import {
  buildChatIgnored,
  buildContactListRequest,
  buildSetContactNote,
} from "#wow/areas/contacts/protocol";
import type { ContactStore, ContactsEvent } from "#wow/areas/contacts/store";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { truncateNote } from "#wow/friend-store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const CONTACTS_REQUEST_TIMEOUT_MS = 3000;

export type ContactsOutcome = { ok: true } | { ok: false; reason: string };

export type ContactsActs = {
  requestContacts: (flags: number) => Promise<ContactsOutcome>;
  setFriendNote: (name: string, note: string) => Promise<ContactsOutcome>;
  reportIgnored: (guid: bigint) => ContactsOutcome;
};

function friendGuidOf(
  friends: readonly { guid: bigint; name: string }[],
  name: string,
): bigint | undefined {
  const lower = name.toLowerCase();
  for (const entry of friends)
    if (entry.name.toLowerCase() === lower) return entry.guid;
  return undefined;
}

export function contactsRuntime(
  ctx: AreaRuntimeCtx<ContactsEvent>,
  store: ContactStore,
  _core: CoreStores,
): AreaRuntime<ContactsActs> {
  function requestContacts(flags: number): Promise<ContactsOutcome> {
    const pending = ctx.until((event) => event.type === "contact_list", {
      timeoutMs: CONTACTS_REQUEST_TIMEOUT_MS,
    });
    ctx.send(GameOpcode.CMSG_CONTACT_LIST, buildContactListRequest(flags));
    return pending.then(() => ({ ok: true }) as ContactsOutcome);
  }

  async function setFriendNote(
    name: string,
    note: string,
  ): Promise<ContactsOutcome> {
    const guid = friendGuidOf(ctx.legacy.friends(), name);
    if (guid === undefined) return { ok: false, reason: "not_friend" };
    const pending = ctx.until((event) => event.type === "contact_list", {
      timeoutMs: CONTACTS_REQUEST_TIMEOUT_MS,
    });
    store.setNote(guid, truncateNote(note));
    ctx.send(
      GameOpcode.CMSG_SET_CONTACT_NOTES,
      buildSetContactNote(guid, note),
    );
    ctx.send(GameOpcode.CMSG_CONTACT_LIST, buildContactListRequest(1));
    await pending;
    return { ok: true };
  }

  function reportIgnored(guid: bigint): ContactsOutcome {
    if (!store.markReported(guid))
      return { ok: false, reason: "already_reported" };
    ctx.send(GameOpcode.CMSG_CHAT_IGNORED, buildChatIgnored(guid));
    return { ok: true };
  }

  function onIgnoredWhisper(event: ContactsEvent): void {
    if (event.type !== "ignored_whisper") return;
    const ignored = ctx.legacy
      .ignored()
      .some((entry) => entry.guid === event.guid);
    if (!ignored) return;
    reportIgnored(event.guid);
  }

  const sub = store.onEvent(onIgnoredWhisper);
  return {
    act: { reportIgnored, requestContacts, setFriendNote },
    dispose: sub,
  };
}
