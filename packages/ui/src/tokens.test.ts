import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { colors, darkColors } from "./tokens";

describe("design tokens match the web CSS variables", () => {
  const css = readFileSync(join(__dirname, "../../../apps/web/app/globals.css"), "utf8").toLowerCase();
  it.each(Object.entries(colors).filter(([k]) => k !== "white"))("%s", (_name, hex) => {
    expect(css).toContain(hex.toLowerCase());
  });
});
