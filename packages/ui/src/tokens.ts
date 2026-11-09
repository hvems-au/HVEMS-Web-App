/**
 * HVEMS design tokens. Brand colours and typography come from the HVEMS Brand
 * Identity Guidelines v1.0 (September 2026), which take precedence; functional
 * colours (links, status, surfaces) come from the Figma file's variables.
 * Platform-neutral so the React Native app can use the same values.
 * apps/web/app/globals.css exposes them as CSS variables; tokens.test.ts
 * checks the two stay in sync.
 */
export const colors = {
  charcoal: "#444444", // Brand: HVEMS Charcoal — sidebar, dark panels, primary text
  shade: "#444444", // = charcoal
  textDark: "#444444", // = charcoal
  darkGrey: "#6B6B6B", // secondary text (AA on white)
  textGrey: "#A7A6AB",
  stroke: "#D9D9D9",
  lightGrey: "#F5F5F7",
  background: "#F8F8F8",
  white: "#FFFFFF",
  brand: "#CE5502", // Brand: HVEMS Orange
  brandProgress: "#F8781F", // "Progress"
  blue: "#2071DD",
  green: "#0EA400",
  red: "#F11617",
  redBox: "#FFE2E2",
  lightYellow: "#FFF5E0",
} as const;

/** Asset condition colours (SoW §3.4: red warning, amber warning, none). */
export const conditionColors = {
  active: { fg: "#0A7A00", bg: "#E6F6E5" },
  needs_attention: { fg: "#9A4A00", bg: "#FFF5E0" },
  out_of_service: { fg: "#C40F10", bg: "#FFE2E2" },
} as const;

export const radii = { input: 6, button: 6, card: 12, authCard: 18, pill: 999 } as const;

/** Brand type hierarchy (Brand Guidelines p.15). Montserrat throughout. */
export const typography = {
  fontFamily: "Montserrat",
  mainTitle: { size: 48, weight: 800 }, // 48–64px, hero sections
  h1: { size: 36, weight: 700 }, // page headings (28px on small screens)
  h2: { size: 30, weight: 600 }, // section headings (24px on small screens)
  h3: { size: 24, weight: 500 },
  h4: { size: 20, weight: 500 },
  h5: { size: 18, weight: 500 },
  h6: { size: 16, weight: 500 },
  subtitle: { size: 16, weight: 400 },
  body1: { size: 16, weight: 400 },
  body2: { size: 14, weight: 400 },
  bullets: { size: 13, weight: 400 }, // 12–14px
} as const;

export const layout = { sidebarWidth: 180, contentPadding: 22, minMobileWidth: 360 } as const;
