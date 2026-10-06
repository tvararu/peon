import { describe, expect, test } from "bun:test";
import { parseAreaNames } from "#tools/area-names";

const wowm = `enum Area : u32 {
    NONE = 0;
    DUN_MOROGH = 1 {
        display = "Dun Morogh";
    }
} {
    versions = "1.12";
}

enum Area : u32 {
    NONE = 0;
    ELWYNN_FOREST = 12 {
        display = "Elwynn Forest";
    }
    EVERSONG_WOODS = 3430 {
        display = "Eversong Woods";
    }
    SUNSTRIDER_ISLE = 3431 {
        display = "Sunstrider Isle";
    }
} {
    rust_base_type = "true";
    versions = "3.3.5";
}
`;

describe("parseAreaNames", () => {
  test("reads the 3.3.5 block by id", () => {
    expect(parseAreaNames(wowm)).toEqual({
      "12": "Elwynn Forest",
      "3430": "Eversong Woods",
      "3431": "Sunstrider Isle",
    });
  });

  test("reads another version block on request", () => {
    expect(parseAreaNames(wowm, "1.12")).toEqual({ "1": "Dun Morogh" });
  });

  test("throws when no block has the version", () => {
    expect(() => parseAreaNames(wowm, "2.4.3")).toThrow(
      "no Area enum for version 2.4.3",
    );
  });
});
