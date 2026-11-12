/**
 * HVEMS design tokens. Brand colours and typography come from the HVEMS Brand
 * Identity Guidelines v1.0 (September 2026), which take precedence; functional
 * colours (links, status, surfaces) come from the Figma file's variables.
 * Platform-neutral so the React Native app can use the same values.
 * apps/web/app/globals.css exposes them as CSS variables; tokens.test.ts
 * checks the two stay in sync.
 */
export const colors = {
  charcoal: "#444444", // Brand: HVEMS Charcoal
  brand: "#CE5502", // Brand: HVEMS Orange (fills: buttons, active navigation)
  brandHover: "#B84B02",
  brandInk: "#B84B02", // orange used as text
  brandSoft: "#FDEEE3",
  brandProgress: "#F8781F",
  nav: "#3A3A3A", // sidebar
  textDark: "#2B2B2E", // primary text
  darkGrey: "#55555B", // secondary text, 7.3:1 on white
  textGrey: "#6C6C73", // tertiary text, 5.3:1 on white
  stroke: "#DDDDE1",
  strokeStrong: "#C4C4CA",
  surface: "#FFFFFF",
  lightGrey: "#F2F2F4", // surface-muted
  background: "#F5F5F6", // page canvas
  white: "#FFFFFF",
  blue: "#1C5FBD",
  green: "#0D8A1F",
  okSoft: "#E7F5E8",
  okInk: "#0A6B18",
  amber: "#C26A00",
  lightYellow: "#FFF4DD",
  warnInk: "#7A3D00",
  red: "#D71A1B",
  redBox: "#FDE8E8",
  dangerInk: "#A10D0E",
  infoSoft: "#E8F0FC",
} as const;

/** Dark theme (opaque values; the web uses translucent tints for some soft backgrounds). */
export const darkColors = {
  brand: "#D35C0C",
  brandInk: "#F39A57",
  nav: "#101114",
  background: "#141518",
  surface: "#1C1E22",
  surfaceRaised: "#24272C",
  textDark: "#ECECEE",
  darkGrey: "#B9B9C0",
  textGrey: "#9A9AA2",
  link: "#85B4F5",
  stroke: "#32353B",
  green: "#4FBF63",
  okInk: "#8AD898",
  amber: "#E2A03F",
  warnInk: "#F0C47F",
  red: "#E5484D",
  dangerInk: "#FF9A9C",
} as const;

/** Asset condition colours (SoW §3.4: red warning, amber warning, none), light theme. */
export const conditionColors = {
  active: { fg: "#0A6B18", bg: "#E7F5E8" },
  needs_attention: { fg: "#7A3D00", bg: "#FFF4DD" },
  out_of_service: { fg: "#A10D0E", bg: "#FDE8E8" },
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

export const layout = { sidebarWidth: 232, contentPadding: 22, minMobileWidth: 360 } as const;
