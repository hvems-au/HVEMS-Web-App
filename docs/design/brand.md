# HVEMS brand (Brand Identity Guidelines v1.0, September 2026)

Source: *HVEMS Brand Book Final.pdf* supplied by HVEMS (not committed; 120 MB). For brand
colours, typeface and type hierarchy it takes precedence over the Figma file. Functional
colours the brand book does not cover (link blue, status green/amber/red, surfaces and
strokes) still come from Figma. Tokens: `packages/ui/src/tokens.ts` ↔ `apps/web/app/globals.css`.

## Colours (p.11)

| Name | Hex | Used for |
|---|---|---|
| HVEMS Orange | `#CE5502` | Primary actions, active navigation, focus ring, accents (`brand`) |
| HVEMS Charcoal | `#444444` | Sidebar and dark panels (`shade`), primary text and headings (`ink`) |
| White | `#FFFFFF` | Cards, text on charcoal/orange |

Secondary text is `#6B6B6B` (`ink-muted`, 5.3:1 on white) so it stays distinct from charcoal.
The on-dark logo SVGs carry three knock-out circles filled with the sidebar colour; they are
`#444444` and must change if the sidebar colour ever does.

## Typeface (p.13)

Montserrat everywhere, self-hosted via `@fontsource-variable/montserrat` (no Google Fonts call).

## Type hierarchy (p.15) → CSS utilities

| Brand style | Size / weight | Utility | Used for in the app |
|---|---|---|---|
| Main Title | 48–64 px ExtraBold | — | Marketing only |
| Heading 1 | 36 px Bold (28 px < 640 px) | `text-h1` | Page headings, auth card, auth hero |
| Heading 2 | 30 px Semibold (24 px < 640 px) | `text-h2` | Section headings |
| Heading 3 | 24 px Medium | `text-h3` | Error / not-found titles |
| Heading 4 | 20 px Medium | `text-h4` | Content block titles |
| Heading 5 | 18 px Medium | `text-h5` | Minor headings |
| Heading 6 | 16 px Medium | `text-h6` | Card titles (with `font-semibold`) |
| Body 1 | 16 px Regular | `text-body-1` | Long-form paragraphs |
| Body 2 | 14 px Regular | `text-body-2` | Table cells, descriptions, form text |

## Logo (pp.4–10)

Use only the supplied artwork (`apps/web/public/brand/`). Minimum 100 px wide on screen;
keep clear space; never stretch, recolour or rearrange. The symbol alone may be used for
app icons and favicons.
