# Cozy MD Editor — VS Code Extension

## What This Is
A VS Code extension that makes markdown feel like a real writing environment.
It layers editorial chrome (toolbar, table ops, frontmatter management),
CriticMarkup-based track changes, and Claude Code integration on top of the
native Monaco text editor — so writers never leave VS Code but never feel like
they're "coding" either.

## Who This Is For
Product managers (and similar non-developer knowledge workers) who are brand new
to VS Code, markdown, and Claude Code — all at once. Every UX decision should
assume the user has never seen a markdown file before and doesn't know what a
terminal is. Power-user features are fine, but the defaults must be
approachable.

## Collaboration Model
Track changes supports three modes, all stored as CriticMarkup in the file:
- **Solo editing** — one author reviewing their own drafts
- **Me + Claude** — Claude as a co-editor, changes attributed to "Claude"
- **Multi-author** — multiple human editors with author attribution

Claude's edits can appear either as CriticMarkup tracked changes (for review)
or as direct edits, toggled by the user via a setting / command. The default
is tracked, so nothing surprises a new user.

## Google Docs Sync — Current Scope
Google Docs round-trip is a key long-term differentiator, but the sync CLI
(`gws-cli`) is blocked. Current policy:
- **Do now (no-regrets):** Store the Google Doc URL in frontmatter so the
  pairing is always captured. Build the "Open in Docs" CodeLens. Use code-fence
  frontmatter delimiters (not `---`) so docs survive a Docs round-trip.
- **Defer:** Programmatic sync, three-way merge, status-bar indicators.
  These can wait until gws-cli unblocks.

## Build & Run
- Requires Node 20+ (`.nvmrc` provided — run `nvm use` if needed)
- `npm install` — install dependencies
- `npm run build` — production build via esbuild
- `npm run watch` — development build with watch mode
- `npm run lint` — run ESLint
- `npm run test` — run parser unit tests (mocha, TDD interface)
- `npm run test:integration` — run VS Code integration tests (requires Extension Development Host)
- `npm run package` — package as .vsix for distribution
- Press F5 in VS Code to launch Extension Development Host

## Technical Decisions
- TypeScript, esbuild bundler, VS Code Extension API
- All features operate on the NATIVE text editor — no custom webview editors
- CriticMarkup is the storage format for all track changes and comments
- Frontmatter uses code fence delimiters (```), NOT triple-dash (---)
  because --- renders as a horizontal rule in Google Docs, breaking round-trip
- Frontmatter parser must READ both formats (compatibility) but WRITE code fences only
- Use `yaml` npm package for frontmatter parsing (preserves comments)
- Use `markdown-it` for markdown structure detection (tables, headings)
- Use `diff` (jsdiff) for character-level diffing in track changes
- CriticMarkup parser is hand-written regex (no npm library exists)
- All decorations use `editor.setDecorations` with `DecorationRenderOptions`
- Claude Code dispatch uses `vscode.window.createTerminal` + `sendText`
- Google Docs/Sheets pairing uses frontmatter URL fields, not a sidecar database

## Architecture
```
src/
├── extension.ts              # Activation, command registration
├── decorations/
│   ├── criticmarkup.ts       # CriticMarkup decoration provider
│   ├── markdown-polish.ts    # Heading styling, syntax dimming
│   └── manager.ts            # Decoration lifecycle management
├── commands/
│   ├── track-changes.ts      # Insert/delete/substitute recording
│   ├── comments.ts           # Add/edit/resolve comments
│   ├── tables.ts             # Table structure operations
│   ├── frontmatter.ts        # YAML frontmatter insertion/editing
│   ├── formatting.ts         # Whitespace, horizontal rules, etc.
│   └── claude.ts             # Claude Code dispatch commands
├── providers/
│   ├── codelens.ts           # Accept/Reject, table ops, @claude tags
│   ├── hover.ts              # Comment tooltips, change details
│   └── completions.ts        # Frontmatter templates, etc.
├── parsers/
│   ├── criticmarkup.ts       # Parse CriticMarkup ranges
│   ├── markdown-table.ts     # Parse/serialize markdown tables
│   └── frontmatter.ts        # Parse/serialize YAML frontmatter
├── claude/
│   ├── dispatch.ts           # Send prompts to Claude Code terminal
│   ├── context-buffer.ts     # Multi-selection context staging
│   ├── file-watcher.ts       # Detect Claude Code file mutations
│   └── annotations.ts        # @claude tag collection and dispatch
├── google/
│   ├── pairing.ts            # Frontmatter URL pairing management
│   ├── sync-status.ts        # Sync state tracking and status bar
│   └── diff-resolve.ts       # Three-way merge for md ↔ Google Docs
└── sidebar/
    └── changes-panel.ts      # Webview sidebar for changes overview
```

## Process Rules

### Document Before Fixing
When an issue is reported or discovered, ALWAYS update this file (Known Issues,
roadmap, or phase scope) BEFORE writing any code to fix it. No battlefield
surgery — every issue gets a paper trail with root cause and proposed approach
before implementation begins. This applies even if the fix seems obvious.

### Parallelize With Agent Teams
Use agent teams to dispatch independent work in parallel whenever tasks touch
non-overlapping files. Only serialize when there are real dependencies.

### Keep Docs Current
Every agent working on this project must update CLAUDE.md if their work changes
the current state, introduces a known issue, or deviates from the documented
plan. The roadmap and Known Issues sections are living documents, not snapshots.

## Code Style
- One module per feature area (see src/ directory structure above)
- All parsers have dedicated unit tests
- Commands are registered in extension.ts, implementations in commands/
- Decoration providers are in decorations/, managed by decorations/manager.ts
- Use VS Code's built-in test runner (`@vscode/test-electron`)

## CriticMarkup Spec Reference
- Addition: {++ added text ++}
- Deletion: {-- deleted text --}
- Substitution: {~~ old text ~> new text ~~}
- Comment: {>> comment text <<}
- Highlight: {== highlighted text ==}{>> optional comment <<}
- Full spec: https://criticmarkup.com/spec.php

## Key Constraints
- NEVER replace the native text editor with a webview/custom editor
- NEVER hold document state outside the file — the file on disk is truth
- NEVER write frontmatter with --- delimiters — always use code fences (```)
- All syntax markers (bold, italic, links, headings, CriticMarkup) follow the
  expand-on-cursor pattern: hidden/dimmed when cursor is away, fully visible
  when cursor enters the element. This is the core UX — it must be flicker-free.
- The decoration manager uses paired DecorationType sets (collapsed + expanded)
  swapped on cursor move, NOT full decoration array rebuilds
- All toolbar buttons must be scoped to `resourceLangId == markdown`
- Track changes recording must handle: paste, undo/redo, multi-cursor,
  editing inside existing CriticMarkup blocks
- Claude Code integration must degrade gracefully when Claude is not installed
- Table operations must preserve column alignment markers
- Google Docs pairing is stored in frontmatter fields, not external config
- Google sync features must degrade gracefully when CLI is unavailable

## Testing
- `npm test` runs parser unit tests via mocha (TDD interface, `suite`/`test`)
  - Scoped to `src/test/suite/parsers/**/*.test.ts` (no vscode dependency)
  - Currently: 16 passing, 0 failing
- `npm run test:integration` runs VS Code integration tests via Extension
  Development Host (`src/test/suite/extension.test.ts`)
- Unit tests target: CriticMarkup parser, table parser/serializer,
  frontmatter parser (both delimiter formats), diff-to-CriticMarkup conversion
- Integration tests target: decoration rendering, expand-on-cursor transitions,
  command execution, accept/reject operations
- Performance test: expand-on-cursor must complete decoration swap in <16ms
  (one frame) on a 500-line document with 50+ decorated elements

## Skills
The `skills/` directory contains Claude Code skills for this project:
- `skills/build/` — `/build` slash command. Runs the full build → lint → test →
  package pipeline and reports pass/fail with actionable summaries.
- `skills/skill-creator/` — Meta-skill for creating, evaluating, and iterating
  on new skills.

## Current State
- Extension activates on markdown files with visible editing features
- **Parsers**: CriticMarkup, frontmatter, markdown-table — all implemented, 16/16 tests passing
- **Decorations**: DecorationManager (expand-on-cursor framework) + MarkdownPolishProvider
  with 10+ sub-providers: heading markers (hidden), heading text (font size via CSS
  injection + fontWeight), bold/italic markers (hidden), link markers (hidden), link
  text (underlined), inline code markers (hidden), inline code content (background),
  code block fences (dimmed), code block content (background), frontmatter (dimmed)
- **Commands**: formatting (bold, italic, code, heading cycle, link, horizontal rule,
  blockquote), table operations (insert, add/remove row/column, alignment), frontmatter
  (insert with templates, edit existing fields) — all implemented and registered
- **Editing behaviors**: Enter continues lists/blockquotes/task lists, Tab/Shift+Tab
  indents lists or navigates table cells, Cmd+[/] indents/outdents lines
- **Table CodeLens toolbar**: Align Columns, Compact, +Row, +Column, Delete Row/Column
  buttons appear above each table
- **Keybindings**: Cmd+B (bold), Cmd+I (italic), Cmd+` (code), Cmd+Shift+H (heading),
  Cmd+K (link), Cmd+Alt+F (frontmatter), Cmd+Alt+T (table menu), Cmd+[/] (indent/outdent),
  Cmd+Alt+[/] (next/prev change), Cmd+Alt+M (CriticMarkup comment, stub)
- **Test fixture**: `test-fixtures/kitchen-sink.md` covers all supported markdown styles
- **Table auto-format**: tables auto-align columns on save (respects `autoAlignOnSave` setting)
- Remaining stubs: comments, track-changes, Claude dispatch, providers, sidebar, google sync
- **Blockquote decoration**: `> ` markers hidden, left border + italic via CSS injection
- **Expand-on-cursor**: narrowed to exact range (not full line) — cursor must be
  within or adjacent to the decorated span for markers to reveal
- F5 should show: hidden syntax markers with expand-on-cursor, sized headings,
  underlined links, inline code with background, blockquote left-border, table
  CodeLens toolbar, Enter/Tab editing behaviors

### Known Issues (from third F5 validation, 2026-03-21)

11. **Inline style markers show asymmetrically**
    When cursor is near a styled span (e.g., `**bold**`), only the leading OR
    trailing markers reveal — not both. This is distracting. Root cause: the
    expand-on-cursor range check treats the opening `**` and closing `**` as
    independent decorated regions, so cursor proximity to one doesn't expand
    the other. Fix: when expanding any marker region for a styled span, also
    expand its paired marker. Requires linking opening/closing marker regions
    (e.g., via a shared span ID or by grouping them into a single region that
    covers the full `**bold**` span). Affects: bold, italic, inline code,
    links. Slot: Phase 1.7.

12. **Table CodeLens always visible**
    The CodeLens toolbar (Align, Compact, +Row, etc.) shows above every table
    at all times. It should only appear when the cursor is inside the table.
    Fix: `provideCodeLenses` should check the active cursor position and only
    return CodeLens items for the table the cursor is in. The provider already
    fires `onDidChangeCodeLenses` on cursor move — just needs the filter
    logic. Slot: Phase 1.7.

13. **CriticMarkup not color-coded (reminder)**
    Additions/deletions/substitutions/comments/highlights render as plain
    text with no color differentiation. The parser exists. The decoration
    provider is Phase 2 work — already scoped. Confirming it is still NEXT
    after Phase 1.7.

14. **Nested ordered list numbering**
    Indented ordered list items show as `1.`, `2.`, etc. at every level.
    Most markdown editors render nested levels differently (e.g., a, b, c or
    i, ii, iii). Markdown itself doesn't specify sub-numbering — this is
    purely a visual/decoration concern. Investigate what common editors do
    (Typora uses a/i alternation). Default to the most common convention;
    add a config option for numbering style to the backlog. Slot: Phase 6.

### Known Issues (from second F5 validation, 2026-03-21)

**Decoration issues (non-blocking):**
1. **Expand-on-cursor scope too broad** — markers reveal when cursor is anywhere
   in the paragraph, not just on the specific styled span. Should only expand
   when cursor is on/inside the exact bold/italic/link/code range.
2. **CriticMarkup not color-coded** — additions/deletions/etc. show as plain
   text. Should be colored (green for additions, red+strikethrough for
   deletions, yellow for highlights, etc.). This is Phase 2 work — parser
   exists, decoration provider does not.
3. **Table column widths still variable** — auto-format on save adds padding
   but the editor uses a proportional font by default. Fixed-width columns
   require either: (a) monospace font for tables, (b) decoration-based
   character-width normalization, or (c) `editor.fontFamily` override scoped
   to table regions. Needs investigation.
4. **Blockquote decoration too plain** — just a `> ` prefix with no visual
   distinction. Should investigate: left-border bar (via `borderLeft` in
   DecorationRenderOptions), background tint, or italic styling for quoted
   text. Other extensions use `before` pseudo-element for the border bar.
5. **Light/dark mode toggle** — future feature. Extension should support a
   theme-aware mode toggle or respect VS Code's color theme automatically.
   Not a defect — add to Phase 5+ or a dedicated UX polish phase.

**Editing behavior issues (non-blocking):**
6. **List continuation on Enter** — pressing Enter at end of a bullet line
   should auto-insert `- ` (or `* `) on the next line. Same for ordered
   lists (`1. ` → `2. `). Empty continuation should remove the bullet.
7. **Blockquote continuation on Enter** — pressing Enter inside a blockquote
   should auto-insert `> ` on the next line. This is the same pattern as #6
   — generalize as "style continuation on Enter" covering: bullets,
   numbered lists, blockquotes, and potentially task lists (`- [ ] `).
8. **Tab should indent bullets** — Tab on a bullet line should indent one
   level (add leading spaces matching list indent), not insert literal
   spaces. Shift+Tab should outdent.
9. **Cmd+[ / Cmd+] for indent/outdent** — should increase/decrease indent
   level of the current line(s). Currently mapped to next/previous change
   (Phase 2) — needs keybinding reassignment. Use Cmd+Alt+[ / Cmd+Alt+]
   for change navigation instead.
10. **Cmd+Alt+M for CriticMarkup comment** — if text is selected, wrap it
    with `{>> ... <<}`. This is a Phase 3 command (track changes recording)
    but the keybinding should be reserved now.

### Other Known Issues
- Heading font size CSS injection hack needs validation across VS Code versions.
- Inline code `ThemeColor('textCodeBlock.background')` may not be visible in all themes.
- Remaining lint warnings (16) are all in Phase 2+ stub files (unused params).

## Phased Roadmap
Phase 0: Build & test skill — DONE
Phase 1: Markdown Polish + Toolbar + Tables — DONE
Phase 1.5: Decoration polish (first pass) — DONE
Phase 1.6: Editing behaviors + decoration refinements — DONE
Phase 1.7: Paired marker expansion + table CodeLens scoping — NEXT
Phase 2: CriticMarkup Display (read/render track changes)
Phase 3: Track Changes Recording + Comments + Simple Claude dispatch
Phase 4: Claude as Collaborator (context buffer, rewrite, file watcher)
Phase 5: Agentic Workflows (@claude annotations, conflict resolution)
Phase 6: UX Polish (light/dark toggle, theme-awareness, nested list numbering,
         table CodeLens styling, advanced table rendering)
Phase 7: Google Workspace Sync — gated on gws-cli availability
         (no-regrets items like frontmatter URL pairing can land any time)

### Phase 1.5 — Decoration Polish, first pass (DONE)
1. Bold/italic markers hidden (transparent+letterSpacing) via `BoldItalicMarkersProvider`
2. Link syntax hidden, link text underlined via `LinkMarkersProvider` + `LinkTextProvider`
3. Table auto-format on save via `onWillSaveTextDocument` in `table-formatter.ts`
4. Heading font size via CSS injection (`textDecoration: 'none; font-size: Xem'`)
5. Inline code: backticks hidden, content gets `backgroundColor`
6. Code blocks: fence markers dimmed, content gets background

### Phase 1.6 Scope — Editing Behaviors + Decoration Refinements (next up)
Editing behaviors that make markdown feel like a word processor:
1. **Style continuation on Enter** — generalized system for auto-continuing
   the current line's style on Enter:
   - Bullet lists: `- ` / `* ` → next line gets same marker
   - Ordered lists: `1. ` → next line gets `2. `, etc.
   - Blockquotes: `> ` → next line gets `> `
   - Task lists: `- [ ] ` → next line gets `- [ ] `
   - Empty continuation (Enter on a line with only the marker) removes it
2. **Tab indent/outdent for lists** — Tab on a bullet/numbered list line
   indents one level, Shift+Tab outdents. Do NOT insert literal spaces.
3. **Cmd+[ / Cmd+] for indent/outdent** — reassign from next/previous change
   (move those to Cmd+Alt+[ / Cmd+Alt+]). Indent/outdent selected lines.
4. **Narrow expand-on-cursor scope** — change the cursor-nearby check in
   DecorationManager from line-based to range-based: only expand a decoration
   when the cursor is within or directly adjacent to the decorated range,
   not anywhere on the same line or paragraph.
5. **Blockquote decoration** — investigate `borderLeft` CSS (via
   `textDecoration` injection or `before` pseudo-element), background tint,
   or italic text to give blockquotes a visual left-bar treatment.
6. **Table toolbar** — when cursor is inside a table, show a floating UI
   element (CodeLens or hover widget) with table controls:
   - "Align Columns" — pad with whitespace for fixed-width columns
   - "Compact" — remove padding whitespace to collapse back
   - Add/remove row/column buttons (surface existing table menu commands)
   This replaces the monospace font investigation — the user controls when
   tables are padded vs compact, and the padding is real whitespace in the
   file (not decoration-based).
7. **Reserve Cmd+Alt+M keybinding** — for CriticMarkup comment insertion
   (implementation in Phase 3, keybinding registered now as no-op or stub).
8. **Tab/Shift+Tab cell navigation in tables** — when cursor is inside a
   table, Tab moves to the next cell, Shift+Tab to the previous cell.
   At end of last cell in a row, Tab moves to first cell of next row.
   At end of last row, Tab creates a new row.

### Phase 1.7 Scope — Paired Markers + Table CodeLens Scoping
Quick fixes from third F5 validation:
1. **Paired marker expansion** — when cursor expands one side of an inline
   style (e.g., the opening `**` of bold), the closing markers must also
   expand. Approach: group opening+closing markers into a single logical
   span in the DecorationManager, so expanding one expands both. Affects
   bold, italic, inline code, links. File: `markdown-polish.ts` (provider
   emits linked regions) + possibly `manager.ts` (span-aware expansion).
2. **Table CodeLens cursor-scoped** — only show CodeLens for the table the
   cursor is currently inside. Filter in `provideCodeLenses` using the
   active editor's cursor position. File: `codelens.ts`.
3. **Table CodeLens styling** — future polish pass on button appearance
   (icons, separators, compact layout). Add to Phase 6 backlog.

### Phase 2 Scope — CriticMarkup Display
Wire the CriticMarkup parser into a decoration provider for visual track changes:
1. **CriticMarkup decoration provider** — register with DecorationManager,
   color additions (green), deletions (red/strikethrough), highlights (yellow),
   comments (gutter icon + hover tooltip), substitutions (old=red, new=green)
2. **CodeLens provider** — Accept/Reject buttons above each CriticMarkup range
3. **Accept/Reject commands** — resolve individual or all changes
4. **Navigation** — next/previous change commands (Cmd+Alt+[ / Cmd+Alt+])
5. **Hover provider** — show comment text and change details on hover
