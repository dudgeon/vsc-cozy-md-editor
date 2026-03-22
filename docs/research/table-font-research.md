# Research: Proportional Fonts and Markdown Table Rendering

> **Date:** 2026-03-22
> **Status:** Complete
> **Relates to:** Open Issue #4 (Medium priority, Phase 6) -- "Table column widths"

---

## 1. The Core Problem

Markdown tables use pipe characters (`|`) and space-padding to create visually
aligned columns in plain text:

```markdown
| Feature     | Status    | Priority |
| :---------- | :-------: | -------: |
| Bold/Italic | Done      | High     |
| Tables      | Partial   | Medium   |
| Claude      | Stub      | High     |
```

This alignment relies on every character occupying the same horizontal width.
With a monospace font (e.g., JetBrains Mono, Menlo), the padding spaces and
content characters all advance the same distance, so the pipes line up
vertically. The table looks like a grid.

With a proportional font (e.g., Inter, Plus Jakarta Sans), characters have
different widths. An "i" is narrower than an "M". A space is narrower than a
"D". The padding spaces that were precisely calculated for monospace no longer
produce vertical alignment. The result:

- Pipe characters do not line up vertically across rows
- The separator row (`|---|---|---|`) is narrower than content rows (because
  dashes are narrower than most letters in proportional fonts)
- The "table" looks like a ragged block of punctuation-decorated text
- The auto-align-on-save feature (`serializeTable`) adds padding that is
  correct in character count but incorrect in visual width

This is not a bug in our formatter. It is a fundamental incompatibility between
character-count-based alignment (what markdown tables are) and variable-width
rendering (what proportional fonts do).

### Why the auto-formatter makes it worse

The `serializeTable()` function in `src/parsers/markdown-table.ts` pads cells
to the column's maximum character width. With monospace fonts, this produces
perfect alignment. With proportional fonts, it can actually make the table
*harder* to read than a compact (unpadded) table, because the padding creates
a false expectation of alignment that the font then violates.

---

## 2. What Other Editors Do

### Typora -- WYSIWYG grid rendering

Typora sidesteps the problem entirely. In its default (WYSIWYG) mode, tables
are rendered as **HTML `<table>` elements** -- a visual grid with cell borders,
row/column handles, and click-to-edit cells. The user never sees pipe characters
or space padding unless they explicitly switch to "Source Code Mode." The
proportional font works fine because the browser's HTML table layout engine
handles column sizing, not character-width math.

**Key insight:** Typora does not solve proportional-font table alignment. It
avoids it by not showing the markdown source for tables at all.

Source: [Table Editing -- Typora Support](https://support.typora.io/Table-Editing/)

### Obsidian -- hybrid approach, known pain point

Obsidian has gone through multiple approaches:

- **Source mode:** Tables display as raw markdown with the editor font
  (proportional by default). Alignment is broken. The community has
  [explicitly requested monospace for table regions](https://forum.obsidian.md/t/consider-monospace-in-default-css-for-markdown-table-sections-in-edit-mode/1598)
  since 2020.
- **Live Preview mode (pre-1.5.3):** Tables rendered as raw markdown until the
  cursor left the table, then collapsed into a rendered grid. This was the best
  of both worlds -- you saw source only while editing.
- **Live Preview mode (1.5.3+):** Tables are now always rendered as a visual
  grid in Live Preview. To see the raw markdown, you must switch to Source mode.
  Users who preferred the old "render when cursor leaves" behavior have
  [asked for it back](https://forum.obsidian.md/t/add-toggle-for-plaintext-table-editing-in-live-preview-mode/73866).
- **Advanced Tables plugin:** The popular community plugin
  ([tgrosinger/advanced-tables-obsidian](https://github.com/tgrosinger/advanced-tables-obsidian))
  provides auto-formatting, Tab navigation between cells, and formula
  evaluation. It formats the source text but does not change the font.

**Key insight:** Obsidian's current answer is the same as Typora's -- render
tables as HTML grids, not as source text. The raw-source alignment problem
with proportional fonts has never been solved in Obsidian; it was bypassed.

### iA Writer -- purpose-built "almost monospace" fonts

iA Writer takes a unique approach. Instead of switching between monospace and
proportional fonts, they designed custom fonts with constrained character
widths:

- **iA Writer Mono:** True monospace. Every character is the same width.
- **iA Writer Duo:** A "duospace" font where all characters are the same width
  *except* M, W, m, and w, which get 1.5x width. This preserves nearly all
  the alignment benefits of monospace while allowing wider letters to breathe.
- **iA Writer Quattro:** A "four-space" font with four possible character
  widths (0.5x, 0.75x, 1x, 1.5x). More proportional than Duo, but far more
  regular than a true proportional font.

Critically, **iA Writer forces tables to use the Mono font regardless of which
font the user has selected for body text.** Since the Mono font was added,
tables always render in Mono in the editor so they stay nicely aligned. The
user can write body text in the warmer Duo or Quattro, but tables automatically
switch to monospace.

**Key insight:** iA Writer is the only editor researched that actually solves
the alignment problem in source view. Their solution: monospace for tables,
proportional for everything else. They also invested in custom fonts that
minimize the visual jarring of switching between the two.

Source: [iA -- In Search of the Perfect Writing Font](https://ia.net/topics/in-search-of-the-perfect-writing-font)

### Markdown Monster -- monospace only

Markdown Monster requires monospace fonts entirely. Proportional fonts cause
cursor offset issues and are explicitly unsupported. Their documentation
states that while you *can* set a non-monospace font, "this will cause the
editor to not properly track the cursor, rendering the editor nearly unusable."

Source: [Markdown Monster -- Font Support](https://markdownmonster.west-wind.com/docs/FAQ/Font-Support-Monospaced-Fonts-Only.html)

### VS Code built-in markdown preview

VS Code's built-in markdown preview renders tables as HTML `<table>` elements,
the same approach as Typora and Obsidian Live Preview. The source editor shows
raw pipe-delimited text. VS Code's default editor font is monospace, so this is
not normally a problem -- it only becomes one when an extension (like ours)
switches the editor to a proportional font.

### Prettier (formatter)

Prettier's markdown formatter pads tables for alignment, which
[assumes monospace](https://github.com/prettier/prettier/issues/6767).
Their issue tracker has an open discussion about this, with some community
members arguing that table padding should be removed entirely for proportional
font users. The counterargument: the padding is for the *source file* (which
may be read in any editor), not for the current editor's font.

### Summary table

| Editor | Approach to table alignment | Font for tables |
| :--- | :--- | :--- |
| **Typora** | WYSIWYG HTML grid | Body font (no source shown) |
| **Obsidian** | HTML grid in Live Preview; broken in Source mode | Body font |
| **iA Writer** | Auto-switch to Mono for table regions | iA Writer Mono |
| **Markdown Monster** | Monospace for everything | Monospace only |
| **VS Code (native)** | Default font is already monospace | Monospace |
| **VS Code (preview)** | HTML `<table>` rendering | Rendered HTML |

---

## 3. VS Code Extension Technical Options

### Option A: CSS injection via `textDecoration` (the current hack)

The extension already uses `textDecoration` CSS injection to set `font-family`
on two element types:

1. **Headings** -- `textDecoration: "none; font-size: 1.875em; font-family: 'Newsreader', ..."`
   (in `src/decorations/markdown-polish.ts`, line 128)
2. **Frontmatter** -- `textDecoration: "none; font-family: 'JetBrains Mono', ..."`
   (in `src/decorations/markdown-polish.ts`, line 1168)

This works by exploiting the fact that VS Code passes the `textDecoration`
value as raw CSS into a `<span>` style attribute. Injecting `; font-family: ...`
after the initial value sets an arbitrary CSS property.

**Can this be used for table regions?** Yes, in principle. We could create a
decoration provider that identifies table lines (using `findTableRegions()` from
`src/commands/table-formatter.ts`) and applies a monospace `font-family` via
the same CSS injection pattern.

**Compatibility warning:** This CSS injection technique broke in VS Code 1.88
(March 2024) through 1.99 (March 2025). The `font-size` injection stopped
working, likely due to a refactor of line height assumptions. It was
[fixed in VS Code 1.100+](https://github.com/144026/vscode-bigger-symbols)
(April 2025). The `font-family` injection may or may not have been affected by
the same breakage -- our heading decorations would have been broken during that
window too. This technique is not officially supported and could break again.

### Option B: Official `DecorationRenderOptions` properties

The `ThemableDecorationRenderOptions` interface (from `@types/vscode`) supports
these CSS-related properties:

- `backgroundColor`, `color`, `opacity`
- `border`, `borderColor`, `borderRadius`, `borderSpacing`, `borderStyle`, `borderWidth`
- `outline`, `outlineColor`, `outlineStyle`, `outlineWidth`
- `fontStyle`, `fontWeight`
- `textDecoration`
- `letterSpacing`
- `cursor`
- `before`, `after` (attachment render options)

**`fontFamily` and `fontSize` are NOT in the official API.** There is a
[long-standing feature request](https://github.com/microsoft/vscode/issues/9078)
(opened 2016) to add `fontSize` support, and separate requests for `fontFamily`.
These have not been implemented as of the current VS Code version.

**Conclusion:** The only way to set `font-family` on a decoration range is
through the `textDecoration` CSS injection hack.

### Option C: Language-scoped `editor.fontFamily` override

VS Code supports language-specific settings via `[markdown]` configuration
scope. Our extension already uses this to set the body font:

```json
{
  "[markdown]": {
    "editor.fontFamily": "'Plus Jakarta Sans', ...",
    "editor.fontSize": 16
  }
}
```

However, this is an all-or-nothing setting. There is no way to set
`editor.fontFamily` for *specific lines* within a file. It applies to the
entire editor instance for that language.

### Option D: Webview overlay for table rendering

VS Code's Custom Editor API and Webview API allow rendering HTML inside the
editor area. In theory, you could detect table regions, create a webview
overlay positioned on top of those lines, and render the table as an HTML
`<table>` element (like Typora/Obsidian do).

**Why this is not viable:**

1. VS Code does not support inline webview overlays that coexist with the
   native text editor. Webviews replace the editor entirely (Custom Editor API)
   or exist in separate panels/sidebars.
2. The extension's core constraint is "NEVER replace the native text editor
   with a webview/custom editor."
3. Issue [#73780](https://github.com/microsoft/vscode/issues/73780) requests
   "more flexible decorations or editor overlays" but this has not been
   implemented.
4. Even if overlays existed, keeping a rendered table in sync with the
   underlying text (cursor position, selection, undo, typing) would be
   extraordinarily complex.

### Option E: "Virtual content" via decoration `before`/`after` attachments

Decoration attachments (`before` and `after` in `DecorationRenderOptions`) can
insert visual pseudo-content adjacent to decorated ranges. In theory, you could
hide the raw table text (via `opacity: 0` or `letterSpacing: -1em`) and insert
a rendered representation via `before` content.

**Why this is not viable:**

1. `contentText` in attachments is plain text only -- no HTML, no grid layout.
2. The amount of content that can be rendered in a `before`/`after` pseudo-
   element is limited and cannot span multiple lines.
3. This would break cursor navigation, selection, typing, and undo within the
   table entirely.

---

## 4. Alternative Approaches

### 4a. Accept the limitation, document it

Do nothing to the font. Accept that tables look rough with proportional fonts.
The existing Align/Compact CodeLens toolbar still works -- it formats the
source text, which is correct for monospace rendering and for other tools that
will read the file. The user can switch to the built-in markdown preview
(Cmd+Shift+M) for a properly rendered HTML table.

**Pros:** Zero risk, zero maintenance, no CSS injection fragility.
**Cons:** Tables look bad. For PMs who work with tables frequently, this is a
significant visual quality gap. The extension's whole pitch is making markdown
feel polished -- ragged tables undermine that.

### 4b. Apply monospace font to table regions via decoration

Use the `textDecoration` CSS injection hack to set `font-family` to the code
font stack (`'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, Consolas,
monospace`) on all lines within detected table regions. This is the iA Writer
approach, and we already have all the pieces:

- `findTableRegions()` in `table-formatter.ts` identifies table line ranges
- The CSS injection pattern is proven (headings, frontmatter)
- The decoration manager handles cursor-based expand/collapse
- The code font stack is already defined in the typography research

**Implementation sketch:**

```typescript
// New provider: TableMonospaceProvider
// Collapsed state: monospace font + slightly smaller size
const TABLE_MONOSPACE_COLLAPSED: DecorationRenderOptions = {
    textDecoration: "none; font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, Consolas, monospace; font-size: 0.85em",
    isWholeLine: true,
};
// Expanded state: same monospace (table lines always use monospace)
const TABLE_MONOSPACE_EXPANDED: DecorationRenderOptions = {
    textDecoration: "none; font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, Consolas, monospace; font-size: 0.85em",
    isWholeLine: true,
};
```

**Pros:**
- Tables actually align. The core visual problem is solved.
- Matches iA Writer's proven approach (monospace for tables, proportional
  for everything else).
- Uses existing infrastructure -- no new API surface, no webviews.
- The font switch is subtle at 0.85em -- it reads as "this region is
  structured data" rather than "this region is code."
- Already validated in the codebase: frontmatter uses this exact pattern
  to switch to a monospace font.

**Cons:**
- Relies on the `textDecoration` CSS injection hack, which broke in VS Code
  1.88-1.99 and could break again.
- Creates a visual discontinuity between table lines and surrounding prose.
  This is intentional (it signals "structured data") but some users may
  find it jarring.
- If the user does not have any of the specified monospace fonts installed,
  the browser falls back to the generic `monospace` keyword (usually Courier
  New), which is ugly.

### 4c. Use a "duospace" or tabular font for the entire editor

Instead of switching fonts per-region, use a font that has more regular
character widths throughout. Options:

- **iA Writer Duo/Quattro**: Purpose-built for this exact problem, but they
  are proprietary to iA Writer (not available for redistribution).
- **IBM Plex Mono**: True monospace, not a good body font for prose.
- **JetBrains Mono with ligatures**: Monospace, good for code, not for prose.
- **A proportional font with tabular figures**: Many proportional fonts offer
  an OpenType `tnum` (tabular numbers) feature that makes digits equal-width.
  However, this only affects digits, not letters or spaces -- it would not
  fix table alignment.

**Conclusion:** There is no readily available font that is both pleasant for
prose reading and regular enough for table alignment. iA designed custom fonts
for this exact reason. Without commissioning similar fonts, this approach is
not practical.

### 4d. Remove padding from tables (compact format)

Instead of padding tables to align columns, serialize tables in a "compact"
format with no extra spaces:

```markdown
|Feature|Status|Priority|
|:---|:---:|---:|
|Bold/Italic|Done|High|
|Tables|Partial|Medium|
```

With proportional fonts, this looks no worse than a padded table (neither
aligns), and it is actually *more readable* because there are no misleading
spaces suggesting alignment that does not exist.

**Pros:** Honest -- does not promise alignment it cannot deliver.
**Cons:** Looks worse in monospace (where padding *does* work). Other tools
and collaborators viewing the same file in monospace editors will see unpadded
tables. Violates the common markdown convention of padded tables.

### 4e. Make table font configurable

Add a `cozyMd.tables.fontFamily` setting that defaults to the code font stack.
Users who want tables in the body font can switch it. Users who want
alignment can keep the default monospace.

This is essentially Option 4b with user control. The default would be
monospace (tables align), but users who prefer visual consistency over
alignment can opt out.

---

## 5. Recommendation

**Option (b) -- apply monospace font to table regions via decoration -- with
a user-configurable setting (Option 4e).**

Rationale:

1. **The target audience (PMs new to VS Code) will create and read tables
   frequently.** Tables are a core tool for product specs, comparison matrices,
   status trackers, and decision logs. Ragged tables undermine the "Cozy"
   experience.

2. **iA Writer has proven this approach works.** They are arguably the gold
   standard for writing-focused editors, and their answer after years of
   iteration is: monospace for tables, proportional for everything else. Their
   users accepted the font switch without complaint.

3. **The implementation is low-risk.** We already have `findTableRegions()`,
   the CSS injection pattern, the decoration manager, and a precedent
   (frontmatter monospace). The new provider is ~30 lines of code.

4. **The CSS injection fragility is a known risk but acceptable.** It broke
   once (VS Code 1.88-1.99) and was fixed. Our heading decorations depend on
   the same hack -- if it breaks, tables are not the only casualty. We should
   track VS Code releases for regressions, but we should not avoid the
   technique when the alternative is permanently broken table rendering.

5. **Making it configurable respects user agency.** A setting like
   `cozyMd.tables.useMonospaceFont` (default: `true`) with the font stack
   from the typography research (`'JetBrains Mono', 'SF Mono', 'Fira Code',
   Menlo, Consolas, monospace`) lets users opt out if they prefer visual
   consistency. The default should be "tables look correct" (monospace), not
   "tables look consistent with body text" (proportional).

6. **The prior typography research actually recommended against this** (line
   378 of `docs/research/typography-system-research.md`: "The font for raw
   table source should be the body font, NOT monospace -- monospace makes it
   feel like a code editor"). That recommendation made sense in the abstract
   but does not hold up against the visual reality: proportional-font tables
   are genuinely hard to read. The iA Writer precedent shows that monospace
   for tables specifically does *not* make the editor feel like a code editor
   -- it makes it feel like a writing tool that handles structured data
   correctly.

### Implementation plan (Phase 6, or earlier if tables become a pain point)

1. Add `cozyMd.tables.useMonospaceFont` boolean setting (default: `true`)
2. Add `cozyMd.tables.monospaceFontFamily` string setting (default: code font
   stack from typography research)
3. Create `TableFontProvider` decoration provider in `markdown-polish.ts`
4. Use `findTableRegions()` to identify table line ranges
5. Apply monospace font via `textDecoration` CSS injection (both collapsed and
   expanded states -- tables should always be monospace, not just when cursor
   is away)
6. Use `font-size: 0.85em` to keep table text visually subordinate to body
   text (same pattern as frontmatter)
7. Integrate with the expand-on-cursor system for consistency (though the font
   itself should not change on cursor proximity)
8. **Revisit the typography research doc** to update the table font guidance

### What NOT to do

- Do not build a webview overlay for tables. The complexity-to-value ratio is
  extreme, and it violates the core "native text editor" constraint.
- Do not switch the entire editor to monospace when a table is detected.
- Do not remove table padding (compact format) by default -- other tools and
  collaborators expect padded tables.
- Do not try to compute per-character pixel widths and adjust padding
  accordingly. This would require font metrics that are not available via the
  VS Code extension API, and the result would be fragile across different
  systems and font installations.

---

## Sources

- [Table Editing -- Typora Support](https://support.typora.io/Table-Editing/)
- [Consider monospace in default CSS for markdown table sections in edit mode -- Obsidian Forum](https://forum.obsidian.md/t/consider-monospace-in-default-css-for-markdown-table-sections-in-edit-mode/1598)
- [Add toggle for plaintext table editing in Live Preview mode -- Obsidian Forum](https://forum.obsidian.md/t/add-toggle-for-plaintext-table-editing-in-live-preview-mode/73866)
- [iA -- In Search of the Perfect Writing Font (Duospace)](https://ia.net/topics/in-search-of-the-perfect-writing-font)
- [iA Writer -- Markdown Guide (table auto-formatting)](https://ia.net/writer/support/basics/markdown-guide)
- [Font Support -- Monospaced Fonts Only -- Markdown Monster](https://markdownmonster.west-wind.com/docs/FAQ/Font-Support-Monospaced-Fonts-Only.html)
- [Prettier Issue #6767 -- Table formatting assumes a monospace font](https://github.com/prettier/prettier/issues/6767)
- [VS Code Issue #9078 -- Support font-size in DecorationRenderOptions](https://github.com/microsoft/vscode/issues/9078)
- [VS Code Issue #73780 -- Add more flexible decorations or editor overlays](https://github.com/microsoft/vscode/issues/73780)
- [vscode-bigger-symbols -- CSS injection compatibility tracking](https://github.com/144026/vscode-bigger-symbols)
- [tgrosinger/advanced-tables-obsidian -- Obsidian table formatting plugin](https://github.com/tgrosinger/advanced-tables-obsidian)
- [Proportional font is not good for Markdown table syntax -- gitit Issue #66](https://github.com/jgm/gitit/issues/66)
