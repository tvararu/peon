import { describe, expect, test } from "bun:test";
import { cleanText, TICKET_TEXT_MAX_BYTES } from "#wow/areas/tickets/text";

describe("ticket text", () => {
  test("drops every link escape bar", () => {
    expect(cleanText("a|Hb|r")).toBe("aHbr");
  });

  test("refuses a text over the byte limit", () => {
    expect(() => cleanText("x".repeat(TICKET_TEXT_MAX_BYTES + 1))).toThrow(
      RangeError,
    );
    expect(cleanText("x".repeat(TICKET_TEXT_MAX_BYTES))).toHaveLength(
      TICKET_TEXT_MAX_BYTES,
    );
  });

  test("counts bytes, not characters", () => {
    const wide = "é".repeat(Math.floor(TICKET_TEXT_MAX_BYTES / 2) + 1);
    expect(() => cleanText(wide)).toThrow(RangeError);
  });
});
