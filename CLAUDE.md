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
  (heading styling, syntax dimming, frontmatter dimming) — implemented and wired up
- **Commands**: formatting (bold, italic, code, heading cycle, link, horizontal rule,
  blockquote), table operations (insert, add/remove row/column, alignment), frontmatter
  (insert with templates, edit existing fields) — all implemented and registered
- **Keybindings**: Cmd+B (bold), Cmd+I (italic), Cmd+` (code), Cmd+Shift+H (heading),
  Cmd+K (link), Cmd+Alt+F (frontmatter), Cmd+Alt+T (table menu)
- **Test fixture**: `test-fixtures/kitchen-sink.md` covers all supported markdown styles
- Remaining stubs: comments, track-changes, Claude dispatch, providers, sidebar, google sync
- F5 should now show heading styling, syntax dimming, and working toolbar commands

### Known Issues — Decoration Polish (from first F5 validation)

1. **Bold/italic markers visible when they shouldn't be**
   Markers (`**`, `*`) are dimmed (opacity 0.3) but still readable. They should
   be fully *hidden* when the cursor is elsewhere — same technique as heading `#`
   markers (`color: transparent` + `letterSpacing: '-1em'`). Requires splitting
   the current `SyntaxDimmingProvider` into a `SyntaxHidingProvider` for
   bold/italic markers that uses the hiding style instead of opacity.

2. **Link URLs visible when they shouldn't be**
   `[text](url)` shows all syntax dimmed but readable. When cursor is away,
   only the link text should be visible — `[`, `](`, the URL, and `)` should
   all be hidden. Same hiding technique as #1. Requires a separate
   `LinkHidingProvider` (or folding links into the syntax-hiding provider).

3. **Tables not visually formatted**
   Raw table markup shows as-is. Tables should render with padded columns
   (fixed-width alignment). Two possible approaches:
   a) Auto-format tables on save/type using `serializeTable()` (rewrites the
      text to add padding) — **recommended**, simpler and produces real
      whitespace the user can see even outside the extension
   b) Decoration-based padding (visual only, text unchanged) — fragile

4. **Heading font size — no differentiation**
   VS Code `DecorationRenderOptions` has no `fontSize` property. Current
   implementation uses only `fontWeight`. Headings all look the same size.
   Workaround to investigate: CSS injection via the `textDecoration` property
   (`textDecoration: 'none; font-size: 1.5em'`). This hack is used by
   extensions like Better Comments and may work for font-size scaling.
   Fallback: use color or underline to distinguish heading levels.

5. **Inline code not visually decorated**
   Backtick markers are dimmed but the code content has no visual treatment
   (no background, no border). Expected: backticks hidden, code content gets
   a subtle background color (e.g., `rgba(128,128,128,0.15)`) to visually
   set it apart as a code span. Requires a new `InlineCodeContentProvider`
   with `backgroundColor` in its collapsed style.

6. **Code blocks lack decoration**
   Fenced code blocks (` ``` `) are passed through with no visual treatment.
   Expected: subtle background on the entire block, dimmed/hidden fence
   markers. Lower priority since VS Code's built-in syntax highlighting
   already handles code block content.

### Other Known Issues
- Remaining lint warnings (16) are all in Phase 2+ stub files (unused params).

## Phased Roadmap
Phase 0: Build & test skill — DONE
Phase 1: Markdown Polish + Toolbar + Tables — DONE, but has decoration issues
         (see Known Issues above — fix before moving to Phase 2)
Phase 1.5: Decoration polish fixes — NEXT
Phase 2: CriticMarkup Display (read/render track changes)
Phase 3: Track Changes Recording + Comments + Simple Claude dispatch
Phase 4: Claude as Collaborator (context buffer, rewrite, file watcher)
Phase 5: Agentic Workflows (@claude annotations, conflict resolution)
Phase 6: Google Workspace Sync — gated on gws-cli availability
         (no-regrets items like frontmatter URL pairing can land any time)

### Phase 1.5 Scope — Decoration Polish (next up)
Fix the decoration issues found during first F5 validation. The goal is that
`test-fixtures/kitchen-sink.md` looks like a polished writing environment, not
raw markdown with colored syntax.

1. **Hide bold/italic markers** — split `SyntaxDimmingProvider` into providers
   that use `color: transparent` + `letterSpacing: '-1em'` (the heading marker
   technique) instead of opacity. Bold/italic content itself stays unstyled.
2. **Hide link syntax** — hide `[`, `](url)`, `)` when cursor is away. Only
   the link text remains visible. Consider adding an underline or color to
   the link text so it's still recognizable as a link.
3. **Auto-format tables** — on save (via `onWillSaveTextDocument`), find all
   tables and replace with `serializeTable()` output. Respects
   `cozyMd.tables.autoAlignOnSave` setting (default true).
4. **Heading font size** — try `textDecoration: 'none; font-size: 1.5em'` CSS
   injection. Test h1=1.6em, h2=1.3em, h3=1.1em. If it doesn't work, fall
   back to color differentiation (h1=accent color, h2=secondary, etc.).
5. **Inline code background** — hide backtick markers, add
   `backgroundColor` to code content. New `InlineCodeContentProvider`.
6. **Code block background** — optional stretch goal. Dim/hide fence markers,
   subtle background on block content.

### Phase 2 Scope
Wire the CriticMarkup parser into a decoration provider for visual track changes:
1. **CriticMarkup decoration provider** — register with DecorationManager,
   color additions (green), deletions (red/strikethrough), highlights (yellow),
   comments (gutter icon + hover tooltip), substitutions (old=red, new=green)
2. **CodeLens provider** — Accept/Reject buttons above each CriticMarkup range
3. **Accept/Reject commands** — resolve individual or all changes
4. **Navigation** — next/previous change commands (Cmd+] / Cmd+[)
5. **Hover provider** — show comment text and change details on hover
