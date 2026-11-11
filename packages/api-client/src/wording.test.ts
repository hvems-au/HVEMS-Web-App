import { describe, expect, it } from "vitest";
import { australianWording } from "./index";

describe("australianWording", () => {
  it("uses odometer and hour meter instead of meter", () => {
    expect(australianWording("Choose a category and a meter type")).toBe("Choose a category and an odometer or hour meter");
    expect(australianWording("Ask a Fleet Manager or Company Admin to start tracking this meter for the asset")).toBe(
      "Ask a Fleet Manager or Company Admin to start tracking this odometer or hour meter for the asset",
    );
    expect(australianWording("Odometer and hour meter readings are recorded here")).toBe("Odometer and hour meter readings are recorded here");
    expect(australianWording("Readings cannot be added to an archived asset")).toBe("Readings cannot be added to an archived asset");
  });
});
