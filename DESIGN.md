# E2E Dashboard DESIGN.md

Adapted from Linear's design system (https://github.com/VoltAgent/awesome-design-md).

## Color Palette

### Canvas & Surfaces
- Canvas (page bg): `#010102`
- Surface-1 (cards): `#16171d`
- Surface-2 (nested): `#1e1f26`
- Surface-3 (hover): `#26272f`
- Surface-4 (borders visible): `#2e303a`

### Text
- Primary: `#f7f8f8`
- Secondary: `#d0d6e0`
- Muted: `#8a8f98`
- Faint: `#62666d`

### Semantic
- Accent (interactive): `#5e6ad2`
- Accent hover: `#828fff`
- Success: `#27a644`
- Success muted bg: `rgba(39, 166, 68, 0.12)`
- Danger: `#e5484d`
- Danger muted bg: `rgba(229, 72, 77, 0.12)`

### Borders
- Subtle: `rgba(255,255,255,0.06)`
- Default: `rgba(255,255,255,0.10)`

## Typography
- Font: Geist Variable (installed via @fontsource-variable/geist)
- Heading weight: 500–600
- Body: 14px/1.5, weight 400
- Mono: ui-monospace (error messages)

## Components

### Cards
- Background: Surface-1 (`#16171d`)
- Border: 1px `rgba(255,255,255,0.06)`
- Border-radius: 8px
- No box-shadows; depth via surface hierarchy only

### Status Indicators
- Passed: left border 2px `#27a644` + green text
- Failed: left border 2px `#e5484d` + red text
- No data: left border 2px `#2e303a` + muted text

### Progress Bar
- Track: Surface-3 (`#26272f`)
- Fill: green `#27a644` (all pass) or red `#e5484d` (any failures)
- Height: 4px, border-radius: 2px

### Badges
- Passed: bg `rgba(39,166,68,0.15)`, text `#27a644`
- Failed: bg `rgba(229,72,77,0.15)`, text `#e5484d`
- No data: bg Surface-3, text muted

## Layout
- Page max-width: 896px (max-w-4xl)
- Card gap: 12px
- Card padding: 20px 24px
