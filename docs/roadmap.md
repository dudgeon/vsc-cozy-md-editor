# Cozy MD Editor — Roadmap

> Living execution roadmap. Updated as phases complete and scope changes.
> For the original product spec, see [Initial-prd.md](Initial-prd.md).
> For open defects and feature requests, see [GitHub Issues](https://github.com/dudgeon/vsc-cozy-md-editor/issues).

## Completed

### Phase 0 — Build Infrastructure
- `/build` slash command (build → lint → test → package pipeline)
- Test infra: ts-node, mocha TDD, scoped to parser unit tests
- `.nvmrc` pinning Node 20+

### Phase 1 — Markdown Polish + Toolbar + Tables
- **Parsers**: CriticMarkup (regex, 5 types), frontmatter (both delimiter
  formats, writes code fences only), markdown-table (alignment, serialization)
- **Decoration manager**: expand-on-cursor with `groupId` (paired markers),
  `spanRange` (full-construct proximity), exact-range cursor check
- **Markdown polish**: 13 sub-providers — heading sizing (CSS injection),
  bold/italic/code/link markers hidden, frontmatter dimmed, blockquotes
  italic+background, code blocks with subtle background
- **Formatting commands**: bold, italic, code, heading cycle, link, horizontal
  rule, blockquote — all with multi-cursor, no-op on empty selection
- **Table operations**: insert, add/remove row/col, alignment via quick pick,
  auto-align on save, cursor-scoped CodeLens toolbar
- **Frontmatter**: insert from 5 templates, edit existing fields
- **Editing behaviors**: Enter continuation (lists, blockquotes, task lists),
  Tab/Shift+Tab indent/outdent with parent list type inheritance, table cell
  navigation, Cmd+[/] indent/outdent

### Phase 2 — CriticMarkup Display
- **Decorations**: Google Docs-style expand-on-cursor via 8 sub-providers.
  Collapsed: additions green+underline, deletions red+strikethrough,
  substitutions show new text only, comments visible with 💬 icon, highlights
  with ✎ marker. Expanded: full syntax with colored backgrounds.
- **CodeLens**: cursor-scoped Accept/Reject with labeled buttons
  (e.g., "✓ Accept Addition", "✗ Reject Deletion", "✓ Resolve Comment")
- **Commands**: accept/reject (single + all), next/previous change navigation
- **Accept/reject by offset**: CodeLens passes exact range offset as argument

---

## Up Next — Phase 3: Track Changes Recording + Comments + Claude Dispatch

### 3.1 Track Changes Recording
Use Snapshot + Diff approach (see Decision Log in CLAUDE.md for rationale).

**UX flow:**
1. Doc opens → track changes OFF → edits are direct, no detection
2. User toggles on (Cmd+Shift+T) → toolbar shows **Done** and **Cancel**
3. Extension snapshots the document; user edits freely (undo works normally)
4. **Done** → `diffWords(snapshot, current)` generates CriticMarkup, replaces
   document in single `editor.edit()`. Single Cmd+Z undoes the generation.
5. **Cancel** → tracking ends, no CriticMarkup generated, edits stay as-is

### 3.2 Comment Command
- Consolidate `addComment` (Cmd+Alt+C) and `addCriticComment` (Cmd+Alt+M)
  into single `cozyMd.addComment` on **Cmd+Alt+M**. Remove Cmd+Alt+C binding.
- With selection: wraps with `{>> <<}`
- CodeLens "Add Comment" button on tracked changes: inserts `{>> <<}` after
  the CriticMarkup range and positions cursor between delimiters

### 3.3 Simple Claude Dispatch
- `askClaudeAboutFile` — sends file path to Claude Code terminal
- `askClaudeAboutSelection` — sends selection + prompt
- `sendFileToClaudeContext` — sends `/add {filePath}`
- Terminal strategy: find existing terminal named per `cozyMd.claude.terminalName`
  (default: "Claude"), fall back to most recent, create new if none exists

### 3.4 Quick Wins
- `togglePreview` — one-line wrapper around `markdown.showPreviewToSide`
- Register `toggleTrackChanges` toggle with visual indicator

### 3.5 Cleanup
- Remove Phase 4 commands from package.json (addToContextBuffer,
  dispatchContextBuffer, clearContextBuffer)
- Remove dead code: `buildMarkerReplacement()`, `findChangeAtCursor()`
- Remove unused deps: `markdown-it`, `picomatch`, `vscode-uri`
- Remove `addComment` command/keybinding (Cmd+Alt+C), consolidate to Cmd+Alt+M

### 3.6 README
- Update README.md as features ship (track changes recording, Claude dispatch)

---

## Future Phases

### Phase 4 — UX Polish (was Phase 6)

**Done:**
- ✅ Light/dark/auto mode toggle button in editor title bar
- ✅ Typography bundle system (Clean + Cozy built-in, user-defined custom
  bundles with full control over fonts/sizes/weights/heading styles)
- ✅ Frontmatter renders in monospace font
- ✅ Word occurrence highlighting disabled for markdown (issue #5)

**Typography & fonts:**
- Change the default typeface bundle (currently Inter 16px/1.6lh) — ship
  2-3 curated bundles (e.g., "Cozy Default" = Inter, "Writer" = iA Writer
  Quattro, "Serif" = Literata or Charter) with font family, size, and line
  height tuned per bundle
- User settings to define custom font bundles and select the active one
  (`cozyMd.typography.activeBundle`, `cozyMd.typography.customBundles`)
- Quick-switch command or toolbar button to cycle between font bundles

**Documentation:**
- README instructions for setting Cozy MD as the default editor for `.md`
  files (via `workbench.editorAssociations` or similar)
- README instructions for reverting to standard VS Code markdown defaults
  (disable extension or reset `[markdown]` settings)

**Core:**
- Toggle all decorations off/on — a "raw markdown" mode that disables
  all Cozy MD decorations (expand-on-cursor, heading styling, syntax
  hiding, CriticMarkup display) and shows the file as plain markdown.
  Toolbar button that says "Raw" / "Cozy" to toggle. Essential escape
  hatch since we take over the default editor for .md files. Should
  also be accessible via Command Palette and a keybinding.

**Typography follow-ups:**
- Toolbar button to cycle between typography bundles (revisit when usage
  patterns emerge — settings may be sufficient)

**Remaining UX polish:**
- Theme-awareness across all decorations
- Nested ordered list numbering + config (research Typora a/i convention)
- Table CodeLens styling improvements
- Replace CodeLens with inline styled badges (`after` pseudo-element)
- Rich text → markdown paste (clipboard HTML → clean markdown) —
  [spec](specs/rich-text-paste.md)
- Google Docs keyboard convention audit (Cmd+Shift+7/8 for lists, etc.)
- Table column width improvements (monospace scoping investigation)
- Cmd+K conflict documentation (intercepts VS Code chord prefix)

### Phase 5 — Google Workspace Sync (was Phase 7)
- Gated on gws-cli availability
- No-regrets items (frontmatter URL pairing) can land any time
- Manual sync with smart diffing (Phase 5a)
- Automated sync via CLI (Phase 5b)

### Deferred — Needs Research / User Validation

**Claude as Collaborator** (was Phase 4):
All three items deferred. User need not validated for context buffer and
rewrite; concurrent editing is complex and needs research before scoping.
- ~~Context buffer~~ — stage selections, dispatch with prompt. Deferred:
  unclear what user problem this solves.
- ~~Rewrite selection with Claude~~ — select text, Claude rewrites, diff
  view. Deferred: same reason.
- **Safe concurrent editing** — research spike in progress. See
  `docs/research-concurrent-editing.md` when available. Key questions:
  what happens when Claude edits a file the user has open? What VS Code
  APIs are available? Is prompting Claude to use CriticMarkup sufficient?

**Agentic Workflows** (was Phase 5):
- @claude annotation detection (CodeLens)
- Single/batch annotation dispatch
- CriticMarkup round-trip to Claude as revision checklist
- Conflict detection: dirty-buffer awareness when file watcher fires

---

## Open Issues

Track in [GitHub Issues](https://github.com/dudgeon/vsc-cozy-md-editor/issues).
Items below are pending migration to GitHub Issues:

1. Outdent list type inheritance — corner cases (renumber subsequent items,
   deeply nested mixed lists, task list outdenting)
2. Heading font size via CSS injection — works but fragile hack
3. letterSpacing hiding on soft-wrapped lines — safe for short markers only
