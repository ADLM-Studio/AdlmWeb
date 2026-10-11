// Every per-line override on the Bill (rate, status, category, trade…) is
// kept under the key this module makes. Two identical QUIV lines used to share
// one, so typing on one priced both and dragging one filed both.

import { describe, it, expect } from "vitest";
import { baseItemKey, buildItemKeys } from "./itemKeys.js";

const line = (over = {}) => ({
  sn: 0,
  code: "WAL-01",
  description: "225mm sandcrete blockwork",
  ...over,
});

describe("buildItemKeys", () => {
  it("keeps the plain sn::code::description key for a line with no twin", () => {
    const items = [line(), line({ code: "SUB-01", description: "Excavate" })];
    expect(buildItemKeys(items)).toEqual([
      "0::WAL-01::225mm sandcrete blockwork",
      "0::SUB-01::Excavate",
    ]);
    expect(buildItemKeys(items)[0]).toBe(baseItemKey(items[0], 0));
  });

  it("gives twins a key each, by their place in the bill", () => {
    const items = [line({ qty: 600 }), line({ qty: 300 }), line({ code: "X" })];
    const keys = buildItemKeys(items);
    expect(keys[0]).toBe("0::WAL-01::225mm sandcrete blockwork#0");
    expect(keys[1]).toBe("0::WAL-01::225mm sandcrete blockwork#1");
    expect(keys[2]).toBe("0::X::225mm sandcrete blockwork");
    expect(new Set(keys).size).toBe(3);
  });

  it("uses the position only when a line has no sn at all (sn 0 is a value)", () => {
    expect(baseItemKey({ code: "A", description: "d" }, 4)).toBe("5::A::d");
    expect(baseItemKey({ sn: 0, code: "A", description: "d" }, 4)).toBe("0::A::d");
  });

  it("keys a materials schedule by its takeoff line and material", () => {
    const it = { sn: 3, takeoffLine: "Blockwork", materialName: "Cement" };
    expect(baseItemKey(it, 0, true)).toBe("3::::Blockwork - Cement");
  });

  it("copes with no list", () => {
    expect(buildItemKeys(null)).toEqual([]);
  });
});
