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

### Log Decisions
When a dependency is added or removed, a technical approach is chosen over an
alternative, or a PRD assumption is overridden by implementation reality — add
an entry to the Decision Log below. Future agents should check this log before
re-investigating settled questions. Include: what was decided, what was rejected,
and why.

## Decision Log
Decisions made during implementation that override or refine the original PRD.

- **Hand-written parsers over markdown-it** (Phase 1): The PRD specified
  `markdown-it` for table boundary detection. Implementation used hand-written
  regex parsers for tables, CriticMarkup, and frontmatter instead. Reason:
  hand-written parsers handle serialization, alignment preservation, and line-
  number tracking directly — markdown-it would require AST transformation.
  `markdown-it` dependency removed as dead weight.
- **Snapshot+Diff over real-time wrapping for track changes** (Phase 3 planning):
  Real-time `onDidChangeTextDocument` wrapping was rejected because VS Code's
  `undoStopBefore/After` has been broken since 2017 (Issue #38535), causing
  Cmd+Z to require two presses. Snapshot+Diff approach: snapshot on toggle-on,
  `diffWords()` on commit, single `editor.edit()` for CriticMarkup generation.
  Undo works perfectly. ~100 lines vs ~400 lines. Every comparable tool (VS
  Code Git SCM, GitLens, Overleaf, Scrivener) uses snapshot+diff.
- **Cmd+Alt+M for comments** (Phase 3 planning): PRD declared both
  `addComment` (Cmd+Alt+C) and `addCriticComment` (Cmd+Alt+M). Consolidated
  to a single command on Cmd+Alt+M per user preference.
- **CodeLens for controls, not styled badges** (Phase 2): CodeLens API does
  not support custom colors/backgrounds. Using unicode prefixes (✓/✗/▦) and
  bracket wrappers as visual anchors. Inline styled badges via `after` pseudo-
  element decorations are a Phase 6 upgrade path.
- **Blockquote markers dimmed, not hidden** (Phase 1.5): `letterSpacing: '-1em'`
  for hiding characters causes column misalignment on soft-wrapped lines.
  Blockquote `> ` markers use opacity dimming instead. Short inline markers
  (bold `**`, backticks) are safe to hide since they don't soft-wrap.
- **`border-left` via textDecoration is not viable** (Phase 1.6): Renders as
  literal pipe `|` characters. Blockquote visual treatment uses italic +
  subtle backgroundColor instead.

## Technical Decisions
- TypeScript, esbuild bundler, VS Code Extension API
- All features operate on the NATIVE text editor — no custom webview editors
- CriticMarkup is the storage format for all track changes and comments
- Frontmatter uses code fence delimiters (```), NOT triple-dash (---)
  because --- renders as a horizontal rule in Google Docs, breaking round-trip
- Frontmatter parser must READ both formats (compatibility) but WRITE code fences only
- Use `yaml` npm package for frontmatter parsing (preserves comments)
- CriticMarkup parser is hand-written regex (no npm library exists)
- Table parser is hand-written (not using markdown-it — the PRD originally
  planned to use markdown-it for table detection, but hand-written parsing
  proved simpler and better suited for serialization/alignment needs)
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
- `skills/release/` — `/release` slash command. End-to-end release pipeline:
  pre-flight checks → changelog/README updates → build validation → marketplace
  publish → git tag & push. Uses AskUserQuestion at key decision points
  (cut release?, version bump type, final publish confirmation). Supersedes the
  old `/publish` skill.
- `skills/skill-creator/` — Meta-skill for creating, evaluating, and iterating
  on new skills.

## Roadmap & Issues
- Execution roadmap: [docs/roadmap.md](docs/roadmap.md)
- Original product spec: [Initial-prd.md](Initial-prd.md)
- Open issues: [GitHub Issues](https://github.com/dudgeon/vsc-cozy-md-editor/issues)
