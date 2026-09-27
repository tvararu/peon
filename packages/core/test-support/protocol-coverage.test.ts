import { describe, expect, test } from "bun:test";
import {
  COVERAGE_DOC,
  coreSources,
  protocolCoverage,
  renderCoverage,
} from "#test-support/protocol-coverage";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("protocolCoverage", () => {
  test("docs/protocol-coverage.md matches the handlers core registers", async () => {
    const rows = protocolCoverage(await coreSources());
    expect(await Bun.file(COVERAGE_DOC).text()).toBe(renderCoverage(rows));
  });

  test("tells handled, stubbed, sent and missing opcodes apart", () => {
    const rows = protocolCoverage(["send(GameOpcode.CMSG_BOOTME)"]);
    const status = new Map(rows.map((r) => [r.name, r.status]));
    expect(status.get("SMSG_UPDATE_OBJECT")).toBe("handled");
    expect(status.get("SMSG_WEATHER")).toBe("stub");
    expect(status.get("CMSG_BOOTME")).toBe("handled");
    expect(status.get("SMSG_SPELLLOGEXECUTE")).toBe("missing");
  });

  test("lists every opcode once", () => {
    const rows = protocolCoverage([]);
    expect(rows.map((r) => r.opcode).toSorted((a, b) => a - b)).toEqual(
      Object.values(GameOpcode).toSorted((a, b) => a - b),
    );
  });
});
