import { describe, expect, it } from "vitest";
import { equipmentCodeFromText } from "./equipment-code";

describe("equipmentCodeFromText", () => {
  it("reads the printed code with or without dashes and spaces", () => {
    expect(equipmentCodeFromText("P2DF-SBPG-97")?.shortCode).toBe("P2DFSBPG97");
    expect(equipmentCodeFromText("p2df sbpg 97")?.shortCode).toBe("P2DFSBPG97");
    expect(equipmentCodeFromText("P2DFSBPG97")?.shortCode).toBe("P2DFSBPG97");
  });

  it("reads the code or token from a scanned QR link", () => {
    expect(equipmentCodeFromText("https://operator.hvems.com.au/driver/e/P2DFSBPG97")?.shortCode).toBe("P2DFSBPG97");
    const t = "abcDEF123_-xyzXYZ98765";
    expect(equipmentCodeFromText(`https://dev-operator.hvems.com.au/driver/e/${t}`)?.token).toBe(t);
    expect(equipmentCodeFromText(t)?.token).toBe(t);
  });

  it("ignores ordinary searches", () => {
    expect(equipmentCodeFromText("CAT-ESC-0001")).toBeNull();
    expect(equipmentCodeFromText("ABC123")).toBeNull();
    expect(equipmentCodeFromText("Isuzu FVZ")).toBeNull();
    expect(equipmentCodeFromText("")).toBeNull();
    // Contains letters the code alphabet never uses (O, I, L, 0, 1).
    expect(equipmentCodeFromText("OIL0-1OIL-01")).toBeNull();
  });
});
