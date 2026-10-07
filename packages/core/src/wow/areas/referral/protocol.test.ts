import { describe, expect, test } from "bun:test";
import {
  readReferralGuid,
  referralFailureBody,
  referralProposeBody,
} from "#test-support/areas/referral";
import {
  buildAcceptLevelGrant,
  buildGrantLevel,
  parseProposeLevelGrant,
  parseReferAFriendFailure,
} from "#wow/areas/referral/protocol";
import { PacketReader } from "#wow/protocol/packet";

const GUID = 0x0000_0000_0001_2345n;

describe("referral builders", () => {
  test("grant and accept carry one packed guid and nothing else", () => {
    expect(readReferralGuid(buildGrantLevel(GUID))).toEqual({
      guid: GUID,
      remaining: 0,
    });
    expect(readReferralGuid(buildAcceptLevelGrant(GUID))).toEqual({
      guid: GUID,
      remaining: 0,
    });
  });

  test("a guid with high bytes keeps its packed mask", () => {
    const guid = 0x1234_0000_0000_0007n;
    expect(readReferralGuid(buildGrantLevel(guid)).guid).toBe(guid);
  });
});

describe("referral parsers", () => {
  test("error 3 has no name", () => {
    const reader = new PacketReader(referralFailureBody(3));
    expect(parseReferAFriendFailure(reader)).toEqual({
      error: 3,
      reason: "insufficient_grantable_levels",
      name: undefined,
    });
    expect(reader.remaining).toBe(0);
  });

  test("error 9 carries the target name", () => {
    const reader = new PacketReader(referralFailureBody(9, "Friend"));
    expect(parseReferAFriendFailure(reader)).toEqual({
      error: 9,
      reason: "not_in_group",
      name: "Friend",
    });
  });

  test("an unknown error keeps its number", () => {
    const reader = new PacketReader(referralFailureBody(40));
    expect(parseReferAFriendFailure(reader).reason).toBe("error_40");
  });

  test("a proposal reads the proposer guid", () => {
    expect(
      parseProposeLevelGrant(new PacketReader(referralProposeBody(GUID))),
    ).toBe(GUID);
  });
});
