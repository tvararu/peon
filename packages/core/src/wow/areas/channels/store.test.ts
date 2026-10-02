import { describe, expect, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import { ChannelStore, type ChannelsEvent } from "#wow/areas/channels/store";
import type { SessionDeps } from "#wow/session-stores";

const ME = 0xde1n;
const PARTNER = 0xab2n;

function setup(now = () => 0) {
  const deps: SessionDeps = {
    getEntity: () => undefined,
    now,
    selfGuid: () => ME,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  const store = new ChannelStore(deps, testStores(deps));
  const seen: ChannelsEvent[] = [];
  store.onEvent((event) => seen.push(event));
  return { seen, store };
}

describe("ChannelStore", () => {
  test("starts with no channels and no invite", () => {
    expect(setup().store.snapshot()).toEqual({
      channels: [],
      pendingInvite: undefined,
    });
  });

  test("you_joined adds the channel and keeps join order", () => {
    const { seen, store } = setup();
    store.notice({
      channel: "peonab12cd",
      channelId: 7,
      flags: 3,
      type: "you_joined",
    });
    store.notice({
      channel: "peon34ef56",
      channelId: 9,
      flags: 1,
      type: "you_joined",
    });
    expect(store.snapshot().channels.map((row) => row.name)).toEqual([
      "peonab12cd",
      "peon34ef56",
    ]);
    expect(store.snapshot().channels[0]).toMatchObject({
      channelId: 7,
      flags: 3,
      selfFlags: 0,
    });
    expect(seen).toHaveLength(2);
  });

  test("you_left deletes the channel", () => {
    const { store } = setup();
    store.notice({
      channel: "peonab12cd",
      channelId: 7,
      flags: 3,
      type: "you_joined",
    });
    store.notice({
      channel: "peonab12cd",
      channelId: 7,
      constant: false,
      type: "you_left",
    });
    expect(store.snapshot().channels).toEqual([]);
  });

  test("a self mode_change updates selfFlags, others leave it alone", () => {
    const { store } = setup();
    store.notice({
      channel: "peonab12cd",
      channelId: 7,
      flags: 3,
      type: "you_joined",
    });
    store.notice({
      channel: "peonab12cd",
      guid: PARTNER,
      newFlags: 3,
      oldFlags: 0,
      type: "mode_change",
    });
    expect(store.snapshot().channels[0]?.selfFlags).toBe(0);
    store.notice({
      channel: "peonab12cd",
      guid: ME,
      newFlags: 3,
      oldFlags: 0,
      type: "mode_change",
    });
    expect(store.snapshot().channels[0]?.selfFlags).toBe(3);
  });

  test("owner_changed stores the owner guid, channel_owner the name", () => {
    const { store } = setup();
    store.notice({
      channel: "peonab12cd",
      channelId: 7,
      flags: 3,
      type: "you_joined",
    });
    store.notice({
      channel: "peonab12cd",
      guid: PARTNER,
      type: "owner_changed",
    });
    expect(store.snapshot().channels[0]).toMatchObject({ owner: PARTNER });
    store.notice({
      channel: "peonab12cd",
      owner: "Partner",
      type: "channel_owner",
    });
    expect(store.snapshot().channels[0]).toMatchObject({
      owner: PARTNER,
      ownerName: "Partner",
    });
  });

  test("channel_owner Nobody clears the owner name", () => {
    const { store } = setup();
    store.notice({
      channel: "peonab12cd",
      channelId: 7,
      flags: 3,
      type: "you_joined",
    });
    store.notice({
      channel: "peonab12cd",
      owner: "Nobody",
      type: "channel_owner",
    });
    expect(store.snapshot().channels[0]?.ownerName).toBeUndefined();
  });

  test("notices match the channel case-insensitively", () => {
    const { store } = setup();
    store.notice({
      channel: "PeonAB12CD",
      channelId: 7,
      flags: 3,
      type: "you_joined",
    });
    store.notice({
      channel: "peonab12cd",
      guid: ME,
      newFlags: 3,
      oldFlags: 0,
      type: "mode_change",
    });
    expect(store.snapshot().channels[0]?.selfFlags).toBe(3);
    expect(store.has("PEONab12cd")).toBe(true);
  });

  test("invite sets the pending invite and hides it after 60 s", () => {
    let at = 1000;
    const { store } = setup(() => at);
    store.notice({ channel: "peonab12cd", inviter: PARTNER, type: "invite" });
    expect(store.snapshot().pendingInvite).toEqual({
      at: 1000,
      channel: "peonab12cd",
      inviter: PARTNER,
    });
    at += 59_999;
    expect(store.snapshot().pendingInvite).toBeDefined();
    at += 1;
    expect(store.snapshot().pendingInvite).toBeUndefined();
  });

  test("other notices emit channel_notice without changing the snapshot", () => {
    const { seen, store } = setup();
    store.notice({
      channel: "peonab12cd",
      channelId: 7,
      flags: 3,
      type: "you_joined",
    });
    const before = store.snapshot();
    store.notice({ channel: "peonab12cd", guid: PARTNER, type: "joined" });
    store.notice({
      actor: ME,
      channel: "peonab12cd",
      target: PARTNER,
      type: "player_kicked",
    });
    store.notice({ channel: "peonab12cd", type: "not_member" });
    expect(store.snapshot()).toEqual(before);
    expect(
      seen.map((event) =>
        event.type === "channel_notice" ? event.notice.type : event.type,
      ),
    ).toEqual(["you_joined", "joined", "player_kicked", "not_member"]);
  });

  test("a list fills the members of a joined channel and emits channel_members", () => {
    const { seen, store } = setup();
    store.notice({
      channel: "peonab12cd",
      channelId: 7,
      flags: 3,
      type: "you_joined",
    });
    store.list({
      channel: "PeonAB12cd",
      flags: 3,
      members: [
        { flags: 3, guid: ME },
        { flags: 0, guid: PARTNER },
      ],
    });
    const row = store.snapshot().channels[0];
    expect(row?.members).toEqual([
      { flags: 3, guid: ME },
      { flags: 0, guid: PARTNER },
    ]);
    expect(row?.memberCount).toBe(2);
    expect(seen.at(-1)).toEqual({
      channel: "PeonAB12cd",
      count: 2,
      flags: 3,
      members: [
        { flags: 3, guid: ME },
        { flags: 0, guid: PARTNER },
      ],
      type: "channel_members",
    });
  });

  test("a count updates the row, keeps the member list and emits without members", () => {
    const { seen, store } = setup();
    store.notice({
      channel: "peonab12cd",
      channelId: 7,
      flags: 3,
      type: "you_joined",
    });
    store.list({
      channel: "peonab12cd",
      flags: 3,
      members: [{ flags: 3, guid: ME }],
    });
    store.count({ channel: "peonab12cd", count: 4, flags: 3 });
    const row = store.snapshot().channels[0];
    expect(row?.memberCount).toBe(4);
    expect(row?.members).toEqual([{ flags: 3, guid: ME }]);
    expect(seen.at(-1)).toEqual({
      channel: "peonab12cd",
      count: 4,
      flags: 3,
      members: undefined,
      type: "channel_members",
    });
  });

  test("a count for a channel we are not on emits and leaves the rows alone", () => {
    const { seen, store } = setup();
    store.count({ channel: "elsewhere", count: 9, flags: 1 });
    expect(store.snapshot().channels).toEqual([]);
    expect(seen).toEqual([
      {
        channel: "elsewhere",
        count: 9,
        flags: 1,
        members: undefined,
        type: "channel_members",
      },
    ]);
  });

  test("a later list replaces the members but a snapshot copy stays unchanged", () => {
    const { store } = setup();
    store.notice({
      channel: "peonab12cd",
      channelId: 7,
      flags: 3,
      type: "you_joined",
    });
    store.list({
      channel: "peonab12cd",
      flags: 3,
      members: [{ flags: 3, guid: ME }],
    });
    const first = store.snapshot().channels[0]?.members;
    store.list({ channel: "peonab12cd", flags: 3, members: [] });
    expect(first).toEqual([{ flags: 3, guid: ME }]);
    expect(store.snapshot().channels[0]?.members).toEqual([]);
  });
});
