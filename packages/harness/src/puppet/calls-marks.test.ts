import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import { decodeCall, PUPPET_CALLS } from "#harness/puppet/calls";

function run(method: string, json: string, acts: Record<string, unknown>) {
  const call = decodeCall(method, json);
  if ("error" in call) throw new Error(call.error);
  const handle = { raid: { act: acts } } as unknown as WorldHandle;
  return PUPPET_CALLS[method]?.run(handle, call.args);
}

describe("raid mark puppet calls", () => {
  test("setRaidMark passes the icon and the guid as a bigint", () => {
    const spy = jest.fn();
    run("setRaidMark", '[7, "17293822569102704709"]', { setRaidMark: spy });
    expect(spy).toHaveBeenCalledWith(7, 17293822569102704709n);
  });

  test("requestRaidMarks takes no arguments", () => {
    const spy = jest.fn();
    run("requestRaidMarks", "[]", { requestRaidMarks: spy });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("pingMinimap passes both coordinates", () => {
    const spy = jest.fn();
    run("pingMinimap", "[-9464.5, 62.25]", { pingMinimap: spy });
    expect(spy).toHaveBeenCalledWith(-9464.5, 62.25);
  });

  test("setRaidMark refuses a guid that is not a number string", () => {
    expect(decodeCall("setRaidMark", '[7, "lynx"]')).toHaveProperty("error");
  });
});
