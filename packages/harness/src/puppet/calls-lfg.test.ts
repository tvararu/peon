import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import { decodeCall, PUPPET_CALLS } from "#harness/puppet/calls";

function handleWith(acts: Record<string, unknown>): WorldHandle {
  return { lfg: { act: acts } } as unknown as WorldHandle;
}

function run(method: string, json: string, acts: Record<string, unknown>) {
  const call = decodeCall(method, json);
  if ("error" in call) throw new Error(call.error);
  return PUPPET_CALLS[method]?.run(handleWith(acts), call.args);
}

describe("lfg puppet calls", () => {
  test.each<[string, string, string, boolean]>([
    ["answerProposal", '["accept"]', "answerProposal", true],
    ["answerProposal", '["decline"]', "answerProposal", false],
    ["teleport", '["out"]', "teleport", true],
    ["teleport", '["in"]', "teleport", false],
    ["voteKick", '["yes"]', "voteKick", true],
    ["voteKick", '["no"]', "voteKick", false],
  ])("%s %s calls the act with %p", (method, json, act, expected) => {
    const spy = jest.fn();
    run(method, json, { [act]: spy });
    expect(spy).toHaveBeenCalledWith(expected);
  });

  test.each([
    ["answerProposal", '["yes"]'],
    ["teleport", '["true"]'],
    ["voteKick", '["accept"]'],
    ["voteKick", "[]"],
  ])("refuses %s with %s", (method, json) => {
    expect(decodeCall(method, json)).toHaveProperty("error");
  });
});
