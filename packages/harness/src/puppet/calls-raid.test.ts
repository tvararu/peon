import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import { decodeCall, PUPPET_CALLS } from "#harness/puppet/calls";

function run(method: string, json: string, acts: Record<string, unknown>) {
  const call = decodeCall(method, json);
  if ("error" in call) throw new Error(call.error);
  const handle = { raid: { act: acts } } as unknown as WorldHandle;
  return PUPPET_CALLS[method]?.run(handle, call.args);
}

describe("raid puppet calls", () => {
  test.each<[string, boolean]>([
    ['["yes"]', true],
    ['["no"]', false],
  ])("answerReadyCheck %s calls the act with %p", (json, expected) => {
    const spy = jest.fn();
    run("answerReadyCheck", json, { answerReadyCheck: spy });
    expect(spy).toHaveBeenCalledWith(expected);
  });

  test.each(['["ready"]', '["not_ready"]', '["true"]', "[]"])(
    "refuses answerReadyCheck with %s",
    (json) => {
      expect(decodeCall("answerReadyCheck", json)).toHaveProperty("error");
    },
  );
});
