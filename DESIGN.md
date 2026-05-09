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
- Font: Pretendard Variable (installed via `pretendard` package)
- Mono: JetBrains Mono Variable (installed via `@fontsource-variable/jetbrains-mono`)
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

## New Widgets (2026-05-09)

### Sparkline (30-day pass-rate)
- SVG inline, 130×24px in card header.
- Stroke 1.4px, color: success(#27a644) when no failures, danger(#e5484d) otherwise.
- Failure dots (`r=1.4`, color danger, opacity 0.85) on points <100%.
- Last data point dot (`r=2.5`, accent color, surface-1 stroke).

### Browser Matrix
- Horizontal row in card body, separated from stats by border-top.
- Per browser: 22×22 rounded icon (Surface-3 default; success/danger muted on status), name (12px) + count (mono 10.5px).
- Browser ID → icon mapping: chromium=CR, webkit=WK, firefox=FF.

### Step Trail
- Mono chips of 11px joined by `→` arrows.
- Failed step: danger-muted bg, danger fg, prefix `✕ `, weight 500, inset 1px shadow.
- Lives inside FailureList items, indented 24px.

### Failure Card (extended)
- Two-column body grid: 132px screenshot placeholder + flexible error pre.
- Screenshot: aspect-ratio 16/10, layered radial+linear gradient placeholder, mono `📷 screenshot` tag at bottom-right.
- Attachments row: pill-shaped chips (10.5px mono, accent-muted bg).

### Flaky List
- Yellow accent: warning-muted bg, warning border (rgba(245,166,35,0.13)).
- Each row: ⚡ icon · test name · file:line · `retry N회 후 통과` pill.

### Slow Tests List
- 3-column grid: 320px name+file / 1fr bar track / 60px duration.
- Bar fill: linear-gradient accent → accent-hover.
- Duration in seconds with one decimal (e.g. `28.4s`).

### Color Tokens (added)
- `--warning: #f5a623`
- `--warning-muted: rgba(245, 166, 35, 0.14)`
- `--accent-muted: rgba(94, 106, 210, 0.15)`

### Typography (changed)
- Sans: `'Pretendard Variable'` (한글 가독성)
- Mono: `'JetBrains Mono'` for numbers, file paths, code (tabular-nums)
- Headings/body: 14px/1.5, letter-spacing -0.005em

## Layout
- Page max-width: 896px (max-w-4xl)
- Card gap: 12px
- Card padding: 20px 24px
