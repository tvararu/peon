import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { channelParams, channelSpec } from "#harness/areas/channels/tool";
import { channelRun } from "#harness/areas/channels/tool-run";
import type { ChannelCtx } from "#harness/areas/channels/tool-types";
import type { Refusal } from "#harness/ops/refusal";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

function ctxOf(channelAdmin: unknown, extra: Record<string, unknown> = {}) {
  return { channelAdmin, ...extra };
}

async function world(acts: Record<string, unknown> = {}) {
  const t = await createTestRuntime();
  const channels = t.handle.channels as unknown as {
    act: Record<string, unknown>;
  };
  channels.act = { ...channels.act, ...acts };
  return t;
}

function callOf() {
  return {
    arguments: channelSpec.minimalArgs,
    id: "c1",
    name: "probe",
    type: "toolCall",
  } as const;
}

describe("channel tool spec", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(
      validateToolArguments(
        { description: "probe", name: "probe", parameters: channelParams },
        callOf(),
      ),
    ).toEqual(channelSpec.minimalArgs);
  });
});

describe("channel kick", () => {
  test("kick calls channelAdmin and reports the server notice", async () => {
    const admin = jest.fn(async () => ({
      notice: { channel: "peonab12cd", type: "muted" },
      ok: true,
    }));
    const t = await world(ctxOf(admin));
    const out = await channelRun(
      { channel: "peonab12cd", do: "kick", player: "Partner" },
      toolCtx(t),
    );
    expect(admin).toHaveBeenCalledWith("peonab12cd", "kick", "Partner");
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("peonab12cd");
  });

  test("kick without a player refuses before sending", async () => {
    const admin = jest.fn(async () => ({ notice: undefined, ok: true }));
    const t = await world(ctxOf(admin));
    const outcome = await channelRun(
      { channel: "peonab12cd", do: "kick" },
      toolCtx(t),
    ).catch((error: Refusal) => error);
    expect(outcome).toBeInstanceOf(Error);
    expect(admin).not.toHaveBeenCalled();
  });

  test("a not_member answer refuses toward join", async () => {
    const admin = jest.fn(async () => ({ ok: false, reason: "not_member" }));
    const t = await world(ctxOf(admin));
    const outcome = await channelRun(
      { channel: "peonab12cd", do: "ban", player: "Partner" },
      toolCtx(t),
    ).catch((error: Refusal) => error);
    expect(outcome).toBeInstanceOf(Error);
  });
});

describe("channel list", () => {
  test("list resolves with the member count", async () => {
    const t = await world(
      ctxOf(undefined, {
        listChannel: jest.fn(async () => ({
          flags: 3,
          members: [{ flags: 3, guid: 0xde1n }],
          ok: true,
        })),
      }),
    );
    const out = await channelRun(
      { channel: "peonab12cd", do: "list" },
      toolCtx(t) as ChannelCtx,
    );
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("1 member");
  });
});
