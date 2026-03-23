# Typography System Specification

> **Purpose:** Defines two switchable typography themes for a markdown editor — "Cozy" (literary/editorial) and "Clean" (knowledge work/information). This spec provides everything needed for implementation: font sources, CSS values, token definitions, loading strategy, and rationale.

---

## Theme Summary

| Property | Cozy | Clean |
|:---|:---|:---|
| **Vibe** | "I'm writing something worth reading" | "I'm organizing knowledge" |
| **Heading font** | Newsreader (serif) | Inter (sans-serif) |
| **Heading fallback** | New York → Charter → Georgia | SF Pro → Helvetica Neue → Arial |
| **Body font** | Plus Jakarta Sans (sans-serif) | Inter (sans-serif) |
| **Body fallback** | Avenir Next → SF Pro → Helvetica Neue | SF Pro → Helvetica Neue → Arial |
| **Hierarchy model** | Mixed family (serif headings, sans body) | Single family, weight-driven |
| **Best for** | Long-form writing, drafts, creative work | Notes, research, structured docs, PRDs |

Both themes are the **user's choice at the editor level** (not per-document). The editor defaults to **Reader** (was "Cozy", renamed post-research) on first launch. Users switch between them via a settings toggle or command palette.

---

## Font Sources & Licensing

All fonts are **free and open-source** under the **SIL Open Font License 1.1**. They may be used in any commercial product, embedded, bundled, and modified. The only restriction is that the font files themselves cannot be sold standalone.

### Newsreader

- **Designer:** Production Type, commissioned by Google Fonts
- **Classification:** Transitional serif, optical-size variable font
- **Google Fonts:** https://fonts.google.com/specimen/Newsreader
- **npm:** `@fontsource-variable/newsreader`
- **Variable axes:** `opsz` (6–72), `wght` (200–800)
- **Styles needed:** Roman 400, 500, 600, 700 + Italic 400, 500
- **Why this font:** Designed specifically for on-screen reading at multiple optical sizes. Has a warm, literary quality without feeling heavy or old-fashioned. The optical size axis means it automatically adjusts stroke contrast and spacing based on the rendered size — thicker strokes and more open spacing at small sizes, more refined contrast at display sizes.

### Plus Jakarta Sans

- **Designer:** Tokotype (Gumpita Rahayu)
- **Classification:** Geometric sans-serif with humanist touches
- **Google Fonts:** https://fonts.google.com/specimen/Plus+Jakarta+Sans
- **npm:** `@fontsource-variable/plus-jakarta-sans`
- **Variable axes:** `wght` (200–800)
- **Styles needed:** Roman 400, 500, 600 + Italic 400, 500
- **Why this font:** Softer and rounder than Inter or DM Sans — it has a warmth that complements Newsreader's literary headings without competing. The geometric structure keeps it clean while the humanist details (open apertures, slightly rounded terminals) keep it from feeling clinical. Good x-height for comfortable body reading.

### Inter

- **Designer:** Rasmus Andersson
- **Classification:** Humanist/neo-grotesque sans-serif, variable font
- **Google Fonts:** https://fonts.google.com/specimen/Inter
- **npm:** `@fontsource-variable/inter`
- **Variable axes:** `wght` (100–900), `opsz` (optional, 14–32)
- **Styles needed:** Roman 400, 500, 600, 700 + Italic 400, 500
- **Why this font:** The single most widely used UI font in the modern SaaS/dev-tool ecosystem (Notion, Linear, GitHub, Figma). Designed specifically for computer screens with tall x-height, clear character differentiation, and optimized spacing. Its ubiquity is both strength (immediately familiar, "invisible") and weakness (can feel generic). For a knowledge-work mode that should disappear and let content dominate, this is exactly right.

---

## Loading Strategy

### Recommended: Self-host via Fontsource (npm)

This avoids external network requests, gives you cache control, and eliminates the Google Fonts privacy/GDPR concern.

```bash
npm install @fontsource-variable/newsreader
npm install @fontsource-variable/plus-jakarta-sans
npm install @fontsource-variable/inter
```

```js
// Import in your app entry point
// Only import what the active theme needs — lazy-load the other theme's fonts

// Always loaded (used in both themes or as body in cozy)
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';

// Loaded when cozy theme is active (or preloaded after initial render)
import '@fontsource-variable/newsreader';
```

### Alternative: Google Fonts CDN

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,500&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet">
```

### font-display strategy

Use `font-display: swap` to avoid invisible text during load. For the editor content area specifically, consider `font-display: optional` if you want to prevent layout shift — the content won't reflow when fonts load, but users on slow connections may see the fallback for the entire session.

### Fallback stacks (macOS system font aware)

The fallback order is chosen so that if primary fonts fail to load, macOS system fonts provide a graceful degradation with minimal change in personality or metrics. Each fallback was selected for closeness to the primary font's x-height, weight range, and overall character.

```css
:root {
  /*
   * CLEAN THEME — all text
   * Primary: Inter (loaded via Fontsource/CDN)
   * Fallback 1: SF Pro — Apple's system UI sans. Very close in spirit to Inter:
   *   same tall x-height, optimized for UI. Ships on every Mac since El Capitan (2015).
   *   Accessed via -apple-system keyword (not available by font-family name in CSS).
   * Fallback 2: Helvetica Neue — ships pre-installed on macOS. Full weight range
   *   (Thin through Bold + italics). More neutral/tighter than Inter but serviceable.
   * Fallback 3: Segoe UI — Windows system font for cross-platform coverage.
   * Fallback 4: Arial — universal last resort.
   */
  --font-clean: 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', Arial, sans-serif;

  /*
   * COZY THEME — headings (serif)
   * Primary: Newsreader (loaded via Fontsource/CDN)
   * Fallback 1: New York — Apple's serif system font. Ships since Catalina (2019).
   *   Also an optical-size variable serif — genuinely the closest macOS match to
   *   Newsreader. Warm, readable, designed for extended reading.
   * Fallback 2: Charter — ships pre-installed since Big Sur (2020). Matthew Carter
   *   design with Black, Bold, Roman, Italic weights. Sturdy and readable.
   * Fallback 3: Georgia — ships with every macOS. The web's original screen serif.
   */
  --font-cozy-heading: 'Newsreader', 'New York', Charter, Georgia, serif;

  /*
   * COZY THEME — body (geometric-humanist sans)
   * Primary: Plus Jakarta Sans (loaded via Fontsource/CDN)
   * Fallback 1: Avenir Next — ships pre-installed since Mountain Lion (2012). Full
   *   weight range (Ultra Light through Heavy) with true italics. This is the closest
   *   macOS match — geometric sans with humanist warmth, rounder and softer than
   *   Helvetica Neue. Adrian Frutiger's design, revised by Apple.
   * Fallback 2: SF Pro — via -apple-system. More neutral than Plus Jakarta Sans
   *   but pairs well enough with serif headings.
   * Fallback 3: Helvetica Neue — serviceable fallback, less warm.
   */
  --font-cozy-body: 'Plus Jakarta Sans', 'Avenir Next', -apple-system, 'Helvetica Neue', sans-serif;

  /*
   * CODE — both themes
   * Primary: JetBrains Mono (if bundled or installed)
   * Fallback 1: SF Mono — ships with macOS since Sierra (2016). Apple's monospace,
   *   used in Terminal.app and Xcode. Excellent quality.
   * Fallback 2: Fira Code — popular with developers, often installed.
   * Fallback 3: Menlo — ships pre-installed on macOS since Snow Leopard (2009).
   *   The longtime default Terminal font. Always available.
   * Fallback 4: Consolas — ships with Microsoft Office for Mac.
   */
  --font-code: 'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, Consolas, monospace;

  /* Legacy aliases (for backward compat if referenced elsewhere) */
  --font-sans-fallback: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', Arial, sans-serif;
  --font-serif-fallback: 'New York', Charter, Georgia, serif;
}
```

#### System-fonts-only mode

If the constraint requires NO external font loading at all, the system degrades gracefully on macOS:

| Role | System-only font | Quality vs primary |
|:---|:---|:---|
| Clean (all text) | SF Pro (via `-apple-system`) | Excellent — nearly identical purpose and metrics |
| Cozy headings | New York | Excellent — also an optical-size variable serif |
| Cozy body | Avenir Next | Good — preserves warmth and geometric character |
| Code | SF Mono → Menlo | Excellent — both are high-quality macOS monospaces |

To enable system-fonts-only mode, simply remove the primary font names from each stack:

```css
[data-font-mode="system"] {
  --font-clean: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', Arial, sans-serif;
  --font-cozy-heading: 'New York', Charter, Georgia, serif;
  --font-cozy-body: 'Avenir Next', -apple-system, 'Helvetica Neue', sans-serif;
  --font-code: 'SF Mono', Menlo, Consolas, monospace;
}
```

---

## Design Tokens

### Shared Tokens (both themes)

These values are constant across themes. They define the spatial rhythm.

```css
:root {
  /* Content width */
  --editor-max-width: 720px;

  /* Base size */
  --font-size-base: 16px;

  /* Type scale (major second, ratio ~1.125–1.2) */
  --font-size-xs: 12px;     /* UI chrome, metadata */
  --font-size-sm: 14px;     /* Secondary text, captions */
  --font-size-body: 16px;   /* Body text */
  --font-size-h3: 16px;     /* Third-level heading (differentiated by weight/style, not size) */
  --font-size-h2: 22px;     /* Second-level heading */
  --font-size-h1: 30px;     /* First-level heading */
  --font-size-title: 36px;  /* Document title (optional, for cover/hero contexts) */

  /* Line heights */
  --line-height-tight: 1.2;    /* Headings */
  --line-height-snug: 1.4;     /* H3, compact paragraphs */
  --line-height-body: 1.7;     /* Body text — clean theme */
  --line-height-cozy: 1.8;     /* Body text — cozy theme */

  /* Spacing (vertical rhythm) */
  --space-paragraph: 12px;     /* Between paragraphs */
  --space-heading-above: 24px; /* Before a heading */
  --space-heading-below: 8px;  /* After a heading */
  --space-list-item: 4px;      /* Between list items */
  --space-block: 16px;         /* Before/after block elements (code, tables) */

  /* Characters per line target: 65–80 */
  /* At 16px body and 720px max-width with ~24px padding each side, this lands at ~72 chars for Inter, ~68 for Plus Jakarta Sans */
}
```

### Clean Theme Tokens

```css
[data-theme="clean"] {
  --font-heading: var(--font-clean);
  --font-body: var(--font-clean);

  --font-weight-h1: 700;
  --font-weight-h2: 600;
  --font-weight-h3: 600;
  --font-weight-body: 400;
  --font-weight-body-bold: 600;

  --letter-spacing-h1: -0.02em;
  --letter-spacing-h2: -0.01em;
  --letter-spacing-h3: 0;
  --letter-spacing-body: 0;

  --line-height-body-actual: var(--line-height-body); /* 1.7 */
}
```

### Cozy Theme Tokens

```css
[data-theme="cozy"] {
  --font-heading: var(--font-cozy-heading);
  --font-body: var(--font-cozy-body);

  --font-weight-h1: 700;
  --font-weight-h2: 600;
  --font-weight-h3: 500;
  --font-weight-body: 400;
  --font-weight-body-bold: 600;

  --letter-spacing-h1: -0.01em;
  --letter-spacing-h2: 0;
  --letter-spacing-h3: 0;
  --letter-spacing-body: 0;

  --line-height-body-actual: var(--line-height-cozy); /* 1.8 */
}
```

---

## Element Styles

These are the resolved CSS rules for the editor content area. Apply them to the markdown rendering container (e.g., `.editor-content` or `.ProseMirror`).

### Headings

```css
.editor-content h1 {
  font-family: var(--font-heading);
  font-size: var(--font-size-h1);
  font-weight: var(--font-weight-h1);
  line-height: var(--line-height-tight);
  letter-spacing: var(--letter-spacing-h1);
  margin-top: var(--space-heading-above);
  margin-bottom: var(--space-heading-below);
}

.editor-content h2 {
  font-family: var(--font-heading);
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-h2);
  line-height: 1.3;
  letter-spacing: var(--letter-spacing-h2);
  margin-top: var(--space-heading-above);
  margin-bottom: var(--space-heading-below);
}

.editor-content h3 {
  font-family: var(--font-heading);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-h3);
  line-height: var(--line-height-snug);
  letter-spacing: var(--letter-spacing-h3);
  margin-top: 20px;
  margin-bottom: 6px;
}
```

**Cozy H3 note:** In cozy theme, H3 uses `font-style: italic` to differentiate from bold body text since both are 16px. Add this override:

```css
[data-theme="cozy"] .editor-content h3 {
  font-style: italic;
}
```

**Clean H3 note:** In clean theme, H3 differentiates purely through weight (600 vs 400 body). The same size as body text but semibold creates a subtle but clear section break. Do NOT use uppercase/small-caps for H3 — it works in UI but feels wrong in a document editor.

### Body Text

```css
.editor-content p {
  font-family: var(--font-body);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-body);
  line-height: var(--line-height-body-actual);
  letter-spacing: var(--letter-spacing-body);
  margin-bottom: var(--space-paragraph);
}
```

### Inline Styles

```css
.editor-content strong {
  font-weight: var(--font-weight-body-bold);
}

.editor-content em {
  font-style: italic;
}

.editor-content a {
  color: var(--color-link);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--color-link) 35%, transparent);
  text-underline-offset: 3px;
  transition: text-decoration-color 0.15s ease;
}

.editor-content a:hover {
  text-decoration-color: var(--color-link);
}
```

### Lists

```css
.editor-content ul,
.editor-content ol {
  font-family: var(--font-body);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-body);
  line-height: var(--line-height-body-actual);
  padding-left: 24px;
  margin-top: var(--space-block);
  margin-bottom: var(--space-block);
}

.editor-content li {
  margin-bottom: var(--space-list-item);
}

.editor-content li::marker {
  color: var(--color-text-muted);
}
```

### Raw Markdown Tables (source view)

Since this is a markdown editor, tables may be displayed as raw pipe-delimited source rather than rendered HTML tables. The font for raw table source should be the body font, NOT monospace — monospace makes it feel like a code editor.

```css
.editor-content .markdown-table-source,
.editor-content pre.table {
  font-family: var(--font-body);
  font-size: calc(var(--font-size-body) * 0.85);
  line-height: 1.6;
  white-space: pre;
  background: var(--color-bg-code);
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid var(--color-border-light);
  overflow-x: auto;
  margin-top: var(--space-block);
  margin-bottom: var(--space-block);
}
```

### Code (inline and block)

Inline code and fenced code blocks should use a monospace font. This is the ONE place where a third font family is acceptable in both themes.

```css
.editor-content code {
  font-family: var(--font-code);
  font-size: 0.9em;
  background: var(--color-bg-code);
  padding: 2px 6px;
  border-radius: 4px;
}

.editor-content pre code {
  display: block;
  padding: 16px 20px;
  border-radius: 8px;
  border: 1px solid var(--color-border-light);
  overflow-x: auto;
  line-height: 1.55;
  font-size: var(--font-size-sm);
}
```

---

## Theme Switching Implementation

### HTML attribute approach (recommended)

```html
<body data-theme="clean">
  <!-- or -->
<body data-theme="cozy">
```

### JS toggle

```js
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('editor-theme', theme);
}

// On load
const saved = localStorage.getItem('editor-theme') || 'clean';
setTheme(saved);
```

### Lazy font loading for cozy theme

Since `clean` is the default, Newsreader and Plus Jakarta Sans don't need to block initial render. Load them after first paint or when the user switches to cozy:

```js
async function loadCozyFonts() {
  await import('@fontsource-variable/newsreader');
  await import('@fontsource-variable/plus-jakarta-sans');
}

// Option A: preload after initial render
requestIdleCallback(loadCozyFonts);

// Option B: load on theme switch
function setTheme(theme) {
  if (theme === 'cozy') loadCozyFonts();
  document.documentElement.setAttribute('data-theme', theme);
}
```

---

## Accessibility Notes

- **Minimum body size:** 16px. Do not go below this for editor content. The sidebar/chrome can use 14px.
- **Line length:** Target 65–80 characters per line. At 720px max-width with 24px padding, this lands naturally for both themes.
- **Contrast:** Both themes' body text should meet WCAG AA (4.5:1 ratio minimum). For a light theme, `#2c2825` on `#ffffff` is 14.7:1 — well above AA.
- **Dyslexia considerations:** Both Inter and Plus Jakarta Sans have open apertures, distinct character shapes (clear `I`/`l`/`1` differentiation in Inter), and good letter spacing. Newsreader headings are large enough that serif legibility is not a concern. The macOS fallbacks (SF Pro, Avenir Next, New York) share these traits — Apple designed all three with accessibility as a core requirement.
- **Zoom/scale:** Because we use variable fonts and relative units where possible, the system scales cleanly from 100% to 200% zoom without breaking layout.
- **Reduced motion:** No font-related animations, but if theme transitions are animated, wrap them in `@media (prefers-reduced-motion: no-preference)`.
- **System font fallback quality:** If running in system-fonts-only mode on macOS, accessibility characteristics are preserved. SF Pro, New York, and Avenir Next all have tall x-heights, clear character differentiation, and strong weight ranges. The degradation is cosmetic, not functional.

---

## Quick Reference Card

For copy-paste into a CLAUDE.md or agent context file:

```
TYPOGRAPHY SYSTEM
=================

Two themes: "clean" (default) and "cozy"

CLEAN THEME
  All text: Inter
  H1: 30px / 700 / -0.02em / line-height 1.2
  H2: 22px / 600 / -0.01em / line-height 1.3
  H3: 16px / 600 / line-height 1.4 (same size as body, weight-differentiated)
  Body: 16px / 400 / line-height 1.7
  Bold: 600
  Code: JetBrains Mono or system monospace

COZY THEME
  Headings: Newsreader (serif)
  Body: Plus Jakarta Sans (sans-serif)
  H1: 30px / 700 / -0.01em / line-height 1.2
  H2: 22px / 600 / line-height 1.3
  H3: 16px / 500 italic / line-height 1.4
  Body: 16px / 400 / line-height 1.8
  Bold: 600
  Code: JetBrains Mono or system monospace

FONT STACKS (with macOS system fallbacks)
  Clean:        'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', Arial, sans-serif
  Cozy heading: 'Newsreader', 'New York', Charter, Georgia, serif
  Cozy body:    'Plus Jakarta Sans', 'Avenir Next', -apple-system, 'Helvetica Neue', sans-serif
  Code:         'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, Consolas, monospace

SYSTEM-FONTS-ONLY MODE (no external loading)
  Clean:        -apple-system (resolves to SF Pro)
  Cozy heading: 'New York' → Charter → Georgia
  Cozy body:    'Avenir Next' → -apple-system → 'Helvetica Neue'
  Code:         'SF Mono' → Menlo

macOS SYSTEM FONT AVAILABILITY
  SF Pro:        every Mac since El Capitan (2015), via -apple-system
  New York:      every Mac since Catalina (2019)
  Charter:       every Mac since Big Sur (2020)
  Avenir Next:   every Mac since Mountain Lion (2012)
  Helvetica Neue: every Mac since 10.x
  SF Mono:       every Mac since Sierra (2016)
  Menlo:         every Mac since Snow Leopard (2009)
  Georgia:       every Mac since OS X

SHARED
  Max content width: 720px
  Paragraph spacing: 12px
  Heading top margin: 24px
  Heading bottom margin: 8px
  All primary fonts: SIL OFL (free, open-source, commercial OK)
  npm: @fontsource-variable/inter, newsreader, plus-jakarta-sans
```

---

## Rationale & Trade-offs

### Why two themes instead of one?

Writing and knowledge work are cognitively different activities. Writing benefits from a reading-optimized, slightly literary aesthetic that encourages flow. Knowledge work benefits from information density and fast scanning. A single "compromise" font satisfies neither mode fully. Letting users switch acknowledges that the same person does both kinds of work, often in the same day.

### Why Inter for clean (and not IBM Plex Sans or Source Sans 3)?

Inter was the final pick over IBM Plex Sans and Source Sans 3 after side-by-side comparison. Inter won on familiarity (users of Notion, Linear, and GitHub will feel immediately at home), x-height (tallest of the three, best for dense information), and ecosystem fit (variable font with optical sizing, most actively maintained). IBM Plex Sans is an excellent alternative if the team later wants to differentiate from the "standard SaaS look" — it has slightly more character and wider default letter-spacing that some users prefer for long reading. Source Sans 3 runs slightly larger at the same pixel size and has a more "document" feel, closer to Google Docs. Both are fully viable drop-in replacements with no licensing changes needed.

### Why Newsreader and not Playfair Display or Instrument Serif?

Newsreader has the optical size axis, which means it genuinely adapts its design as the rendered size changes — thicker strokes and more open forms at 16px, more refined high-contrast forms at 30px+. Playfair Display is beautiful at large sizes but gets too spindly below 20px. Instrument Serif is lovely but only has a Regular weight (no bold), which limits heading hierarchy options.

### Why Plus Jakarta Sans and not DM Sans for cozy body?

Plus Jakarta Sans is slightly rounder and warmer than DM Sans, which creates a more pronounced contrast against Newsreader's sharpness. DM Sans is a hair more neutral — if the team wants the cozy theme to feel less "soft," DM Sans is the swap. Same license, same loading story.

### Why these specific macOS fallbacks?

The fallback chain was chosen for personality match, not just availability. Many fallback stacks default to generic safe choices (Arial, Georgia, Helvetica), but macOS ships several high-quality fonts that closely match our primaries:

- **SF Pro** (for Inter): Both are screen-optimized UI sans-serifs with tall x-heights. Apple designed SF Pro for the same use cases Inter was designed for — the metrics and personality are close enough that most users won't notice the swap.
- **New York** (for Newsreader): Apple's serif system font is also an optical-size variable serif with warm, transitional character. This is arguably the single best system-font-to-web-font match on any platform.
- **Avenir Next** (for Plus Jakarta Sans): Both are geometric sans-serifs softened by humanist details. Frutiger's Avenir was the original "Futura with warmth" design, and Plus Jakarta Sans sits in the same tradition.
- **SF Mono / Menlo** (for code): Both are pre-installed, high-quality monospace fonts that developers already use daily.

The key insight is that Apple's font library is much stronger than most developers realize. By targeting Apple's premium system fonts before falling back to the generic web-safe fonts, the system-fonts-only experience is genuinely good — not just "acceptable."