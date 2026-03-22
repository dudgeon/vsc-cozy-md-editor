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

## Technical Decisions
- TypeScript, esbuild bundler, VS Code Extension API
- All features operate on the NATIVE text editor — no custom webview editors
- CriticMarkup is the storage format for all track changes and comments
- Frontmatter uses code fence delimiters (```), NOT triple-dash (---)
  because --- renders as a horizontal rule in Google Docs, breaking round-trip
- Frontmatter parser must READ both formats (compatibility) but WRITE code fences only
- Use `yaml` npm package for frontmatter parsing (preserves comments)
- CriticMarkup parser is hand-written regex (no npm library exists)
- Table parser is hand-written (not using markdown-it)
- All decorations use `editor.setDecorations` with `DecorationRenderOptions`
- Claude Code dispatch uses `vscode.window.createTerminal` + `sendText`
- Google Docs/Sheets pairing uses frontmatter URL fields, not a sidecar database

## Architecture
```
src/
├── extension.ts              # Activation, command registration, wiring
├── decorations/
│   ├── manager.ts            # Decoration lifecycle — expand-on-cursor engine
│   ├── criticmarkup.ts       # CriticMarkup decoration (8 sub-providers)
│   └── markdown-polish.ts    # Heading/syntax/blockquote/code decorations (13 sub-providers)
├── commands/
│   ├── formatting.ts         # Bold, italic, code, heading, link, blockquote
│   ├── editing.ts            # Enter continuation, Tab indent, table cell nav
│   ├── tables.ts             # Table structure operations (insert, add/del rows/cols)
│   ├── table-formatter.ts    # Auto-align tables on save
│   ├── frontmatter.ts        # YAML frontmatter insertion/editing with templates
│   ├── track-changes.ts      # Accept/reject/navigate CriticMarkup changes
│   ├── comments.ts           # [STUB] Add/edit/resolve comments
│   └── claude.ts             # [STUB] Claude Code dispatch commands
├── providers/
│   ├── codelens.ts           # Table toolbar + CriticMarkup accept/reject CodeLens
│   ├── hover.ts              # [STUB] Hover tooltips
│   └── completions.ts        # [STUB] Completions provider
├── parsers/
│   ├── criticmarkup.ts       # Parse CriticMarkup ranges (regex, all 5 types)
│   ├── markdown-table.ts     # Parse/serialize markdown tables with alignment
│   └── frontmatter.ts        # Parse/serialize YAML frontmatter (both delimiter formats)
├── claude/                   # [ALL STUBS] Claude Code integration
│   ├── dispatch.ts           # Send prompts to Claude Code terminal
│   ├── context-buffer.ts     # Multi-selection context staging
│   ├── file-watcher.ts       # Detect Claude Code file mutations
│   └── annotations.ts        # @claude tag collection and dispatch
├── google/                   # [ALL STUBS] Google Workspace integration
│   ├── pairing.ts            # Frontmatter URL pairing management
│   ├── sync-status.ts        # Sync state tracking and status bar
│   └── diff-resolve.ts       # Three-way merge for md ↔ Google Docs
└── sidebar/
    └── changes-panel.ts      # [STUB] Webview sidebar for changes overview
```

## Code Style
- One module per feature area (see architecture above)
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

## VS Code API Limitations (learned the hard way)
These are things we tried that DON'T WORK in the VS Code extension API:
- **`fontSize` in DecorationRenderOptions** — not a supported property.
  Workaround: CSS injection via `textDecoration: 'none; font-size: 1.6em'`
  (works for font-size, validated in F5).
- **`border-left` via textDecoration injection** — renders as literal pipe `|`
  characters instead of a CSS border. NOT VIABLE.
- **`padding-left` via textDecoration injection** — same issue, not viable.
- **`letterSpacing: '-1em'` for hiding characters** — works on single lines but
  causes misaligned columns when text soft-wraps. Safe for short inline markers
  (bold `**`, link brackets), NOT safe for blockquote `> ` markers on long lines.
- **CodeLens custom styling** — CodeLens API has no support for colors,
  backgrounds, or fonts. Titles are plain text in VS Code's built-in style.
  Unicode prefixes (✓, ✗, ▦) and bracket wrappers are the only visual options.
- **Per-language color customizations** — `workbench.colorCustomizations`
  cannot be scoped per language. Line number dimming affects all file types.
  Per-theme customization (`[Default Dark Modern]` etc.) works but is verbose.

## Testing
- `npm test` runs parser unit tests via mocha (TDD interface, `suite`/`test`)
  - Scoped to `src/test/suite/parsers/**/*.test.ts` (no vscode dependency)
  - Currently: 16 passing, 0 failing
- `npm run test:integration` runs VS Code integration tests via Extension
  Development Host (`src/test/suite/extension.test.ts`)
- Unit tests target: CriticMarkup parser, table parser/serializer,
  frontmatter parser (both delimiter formats)
- Integration tests target: decoration rendering, expand-on-cursor transitions,
  command execution, accept/reject operations (most not yet written)
- Performance test: expand-on-cursor must complete decoration swap in <16ms
  (one frame) on a 500-line document with 50+ decorated elements

## Skills
The `skills/` directory contains Claude Code skills for this project:
- `skills/build/` — `/build` slash command. Runs the full build → lint → test →
  package pipeline and reports pass/fail with actionable summaries.
- `skills/skill-creator/` — Meta-skill for creating, evaluating, and iterating
  on new skills.

## Current State

### What works (F5 validated)
- **Parsers**: CriticMarkup, frontmatter, markdown-table — all implemented, 16/16 tests passing
- **Decoration manager**: expand-on-cursor with `groupId` (paired markers),
  `spanRange` (full-construct proximity), exact-range cursor check (not line-based)
- **Markdown polish**: heading sizing (CSS injection), bold/italic/code/link markers
  hidden with expand-on-cursor, frontmatter dimmed, blockquotes italic+background,
  code blocks with subtle background
- **CriticMarkup display**: Google Docs-style — delimiters hidden when cursor is away,
  additions green, deletions red+strikethrough, substitutions show new text only,
  comments visible with 💬 icon, highlights with ✎ marker. Cursor-scoped
  Accept/Reject CodeLens with labeled buttons.
- **Commands**: formatting (bold/italic/code/heading/link/blockquote/horizontal rule),
  table ops (insert, add/remove row/col, alignment via quick pick), frontmatter
  (insert with 5 templates, edit existing fields), accept/reject/navigate changes
- **Editing behaviors**: Enter continues lists/blockquotes/task lists, Tab indents
  lists or navigates table cells, Shift+Tab outdents with parent list type
  inheritance, Cmd+[/] indents/outdents lines
- **Table auto-format**: columns align on save (configurable)
- **Table CodeLens**: cursor-scoped toolbar (Align, Compact, +Row, +Col, -Row, -Col)
- **Keybindings**: Cmd+B, Cmd+I, Cmd+`, Cmd+Shift+H, Cmd+K, Cmd+Alt+F, Cmd+Alt+T,
  Cmd+[/], Cmd+Alt+[/], Cmd+Alt+M (stub)

### What's stubbed out
- Comments command (`comments.ts`)
- Claude Code integration (`claude/*.ts`)
- Google Workspace integration (`google/*.ts`)
- Sidebar changes panel (`sidebar/changes-panel.ts`)
- Hover provider, completions provider

### Technical debt
- `buildMarkerReplacement()` in `editing.ts` — dead code from old two-phase
  outdent approach, replaced by inline logic
- `findChangeAtCursor()` in `track-changes.ts` — dead code, replaced by
  `findChangeByOffsetOrCursor()`
- Some `textDecoration` CSS injection TODOs should be resolved (validated or
  removed) rather than left as open questions
- `markdown-it` listed as dependency but never imported — table parser is
  hand-written. Consider removing the dep.
- 10+ package.json commands declared but unregistered (saveIndicator,
  togglePreview, insertBlock, toggleTrackChanges, Claude commands) — these
  are placeholders for future phases but currently show as broken commands
  in the command palette

## Open Issues

### High priority (fix before moving to Phase 3)
1. **Outdent list type inheritance — corner cases** — renumber subsequent
   items, deeply nested mixed lists (3+ levels), task list outdenting.
2. **Unregistered commands in package.json** — 10+ commands show in command
   palette but do nothing. Either register stubs or remove from package.json
   until implemented.

### Medium priority (UX polish, Phase 6)
3. **Nested ordered list numbering** — sub-levels show 1/2/3 at every depth.
   Research convention (Typora uses a/i alternation). Add config option.
4. **Table column widths** — proportional font makes padded tables uneven.
   Table toolbar offers Align/Compact but visual result is limited. Investigate
   monospace scoping for table regions.
5. **Light/dark mode toggle** — button in editor title bar. Theme-aware
   decoration colors. Per-theme line number dimming already in place.
6. **Rich text → markdown paste** — convert clipboard HTML to markdown on paste.
7. **Google Docs keyboard convention audit** — research shortcuts to preserve
   (Cmd+K done, audit Cmd+Shift+7/8 for lists, etc.).
8. **Replace CodeLens with inline styled badges** — use `after` pseudo-element
   decorations for Accept/Reject buttons with colored backgrounds (CodeLens
   API cannot be styled).
9. **Cmd+K conflict** — intercepts VS Code's Cmd+K chord prefix (e.g.,
   Cmd+K Cmd+T for theme switching). Accepted trade-off for Google Docs
   compatibility, but worth noting.

### Low priority (known limitations)
10. **Heading font size via CSS injection** — works but is a hack. May break
    in future VS Code versions if they sanitize textDecoration more strictly.
11. **letterSpacing hiding on soft-wrapped lines** — works for short markers,
    breaks for blockquote `> ` (fixed by switching to opacity dimming). May
    affect other markers if lines are very long.

## Phased Roadmap

### Completed
- **Phase 0**: Build & test skill (`/build` slash command, test infra, .nvmrc)
- **Phase 1**: Markdown polish, toolbar, tables — parsers, decoration manager,
  formatting commands, table operations, frontmatter commands
- **Phase 1.5–1.9**: Iterative decoration polish — marker hiding, heading font
  size, expand-on-cursor narrowing (groupId, spanRange), editing behaviors
  (Enter continuation, Tab indent, table cell nav), list type inheritance,
  blockquote decoration, code block styling, line number dimming
- **Phase 2**: CriticMarkup display — color-coded decorations with Google
  Docs-style expand-on-cursor, cursor-scoped Accept/Reject CodeLens with
  labeled buttons, accept/reject/all commands, change navigation

### Up next
- **Phase 3**: Track Changes Recording + Comments + Simple Claude dispatch
  Record edits as CriticMarkup (insertions → `{++ ++}`, deletions → `{-- --}`),
  implement comment command (Cmd+Alt+M wraps with `{>> <<}`), basic Claude
  Code terminal dispatch.

### Future
- **Phase 4**: Claude as Collaborator — context buffer, rewrite commands,
  file watcher for Claude-initiated changes
- **Phase 5**: Agentic Workflows — @claude annotations, conflict resolution
- **Phase 6**: UX Polish — light/dark toggle, theme-awareness, nested list
  numbering, table styling, rich text paste, Google Docs keybinding audit,
  inline styled badges for Accept/Reject
- **Phase 7**: Google Workspace Sync — gated on gws-cli availability
