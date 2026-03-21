# Markdown Craft — VS Code Extension

## What This Is
A VS Code extension for knowledge work in markdown. It layers editorial chrome
(toolbar, table ops, frontmatter management), CriticMarkup-based track changes,
and Claude Code integration on top of the native Monaco text editor.

## Build & Run
- `npm install` — install dependencies
- `npm run build` — production build via esbuild
- `npm run watch` — development build with watch mode
- `npm run lint` — run ESLint
- `npm run test` — run unit tests
- `npm run test:integration` — run VS Code integration tests
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
- Unit tests for: CriticMarkup parser, table parser/serializer,
  frontmatter parser (both delimiter formats), diff-to-CriticMarkup conversion
- Integration tests for: decoration rendering, expand-on-cursor transitions,
  command execution, accept/reject operations
- Performance test: expand-on-cursor must complete decoration swap in <16ms
  (one frame) on a 500-line document with 50+ decorated elements
- Run: `npm test`

## Skills
The `skills/` directory contains Claude Code skills for this project:
- `skills/skill-creator/` — Meta-skill for creating, evaluating, and iterating
  on new skills. Use this to build project-specific skills (e.g., build/test
  automation, extension packaging, CriticMarkup validation).

### Build & Test Skill (TODO)
Create a dedicated skill using skill-creator that automates the build/test
workflow for this extension:
- Run `npm run build` and parse esbuild output for errors
- Run `npm run lint` and surface ESLint violations
- Run `npm test` (unit tests) and `npm run test:integration` (VS Code tests)
- Package as .vsix and validate the package contents
- Provide a single `/build` slash command that runs the full pipeline
- Report pass/fail status with actionable error summaries

## Phased Roadmap
Phase 0: Build & test skill (use skill-creator to create a /build skill)
Phase 1: Markdown Polish + Toolbar + Tables (foundation editing UX)
Phase 1b: Browser Preview (web extension build so extension runs in vscode.dev / cowork browser for feedback)
Phase 2: CriticMarkup Display (read/render track changes)
Phase 3: Track Changes Recording + Comments + Simple Claude dispatch
Phase 4: Claude as Collaborator (context buffer, rewrite, file watcher)
Phase 5: Agentic Workflows (@claude annotations, conflict resolution)
Phase 6: Google Workspace Sync (manual then programmatic)
