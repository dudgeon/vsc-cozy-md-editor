---
name: preview
description: Start the style preview server and open it for visual feedback on extension typography, colors, and layout. Use when iterating on visual design of headings, syntax dimming, CriticMarkup colors, toolbar layout, or any decoration styling.
---

# Style Preview

Starts the Tier 1 browser style preview for rapid visual iteration.

## What to do

1. Kill any existing preview server:
   ```bash
   pkill -f "node preview/serve.js" 2>/dev/null || true
   ```

2. Start the preview server:
   ```bash
   npm run preview &
   ```

3. Confirm it's running by fetching `http://localhost:8271` and tell the user the preview is ready.

4. If the user has requested style changes (opacity, font sizes, colors, etc.), update `preview/index.html` to reflect them, then tell the user to refresh.

5. When the user approves style values, propagate them back to the extension source:
   - Heading scales/weights → `src/decorations/markdown-polish.ts` (`HEADING_SCALES`, `HEADING_WEIGHTS`)
   - Dim opacity → `src/decorations/markdown-polish.ts` (`DIM_OPACITY`)
   - CriticMarkup colors → `package.json` configuration defaults
   - Font defaults → `package.json` `configurationDefaults`

## Key files

- `preview/index.html` — the preview page (CSS variables mirror extension values)
- `preview/serve.js` — static file server (port 8271)
- `src/decorations/markdown-polish.ts` — heading styles, dim opacity, syntax marker logic
- `src/decorations/criticmarkup.ts` — CriticMarkup decoration styles
- `package.json` — configuration defaults and settings schema
