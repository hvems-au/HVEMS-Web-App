/**
 * HVEMS design tokens, taken from the Figma file's variables
 * (HVEMS Web App, Company - Dashboard frame) and the supplied logo artwork.
 * Platform-neutral so the React Native app can use the same values.
 * apps/web/app/globals.css exposes them as CSS variables; tokens.test.ts
 * checks the two stay in sync.
 */
export const colors = {
  shade: "#0B0B0B", // sidebar / dark panels
  textDark: "#090D11",
  darkGrey: "#5B5C5D",
  textGrey: "#A7A6AB",
  stroke: "#D9D9D9",
  lightGrey: "#F5F5F7",
  background: "#F8F8F8",
  white: "#FFFFFF",
  brand: "#CE5502", // "Logo Color"
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

export const typography = {
  fontFamily: "Inter",
  pageTitle: { size: 24, weight: 700 },
  sectionTitle: { size: 15, weight: 600 },
  body: { size: 14, weight: 400 },
  small: { size: 12, weight: 400 },
} as const;

export const layout = { sidebarWidth: 180, contentPadding: 22, minMobileWidth: 360 } as const;
