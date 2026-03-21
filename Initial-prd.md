# Markdown Craft — VS Code Extension for Knowledge Work

> **Document type:** Seed Spec / PRD / Roadmap
> **Author:** Geoff Dudgeon + Claude
> **Created:** 2026-03-21
> **Status:** Draft — ready for Claude Code implementation

-----

## 1. Vision

Markdown Craft turns VS Code’s native text editor into a first-class environment for knowledge work — reading, writing, reviewing, and collaborating on markdown documents — without replacing the editor or sacrificing the extension ecosystem. It bridges the gap between “markdown as code” and “markdown as document” by layering editorial chrome, inline rendering, CriticMarkup-powered track changes, and Claude Code integration on top of the native Monaco editor.

The extension is designed for product managers, researchers, and knowledge workers who live in markdown but want the editing affordances of Word/Google Docs — without leaving the tool their AI coding agents already operate in.

-----

## 2. Design Principles

1. **Native editor, always.** Every feature operates on the standard VS Code text editor. No custom webview editors, no replacement of Monaco. The user retains keybindings, vim mode, multi-cursor, spell check, Git gutter, Copilot, and every other extension they’ve installed.
1. **CriticMarkup is the storage format.** Track changes and comments are persisted as CriticMarkup in the markdown file itself. This means files are portable (readable by any text editor), Claude Code can read and act on them natively, and the extension is a rendering/interaction layer — not a data silo.
1. **Progressive disclosure.** A new user sees a cleaner markdown editing experience with a few helpful buttons. A power user gets track changes, Claude Code dispatch, and structural document operations. Features activate contextually.
1. **Claude Code is a peer, not a dependency.** Claude Code integration enhances the workflow but the extension is fully useful without it. No features should break if Claude Code isn’t installed or running.
1. **Files on disk are always the source of truth.** The extension never holds state that isn’t in the file. This ensures Claude Code, Git, and other tools always see the canonical version.
1. **Google Workspace is a first-class pair.** Local markdown files can be paired with a Google Doc or Google Sheet via a URL in the frontmatter. Today this pairing is informational and sync is manual (via skills); in the future it will be programmatic via CLI. The extension should assume this round-trip exists and design for it — including frontmatter syntax choices that survive Google Docs import/export.

-----

## 3. Technical Foundation

### 3.1 Extension Architecture

```
markdown-craft/
├── src/
│   ├── extension.ts              # Activation, command registration
│   ├── decorations/
│   │   ├── criticmarkup.ts       # CriticMarkup decoration provider
│   │   ├── markdown-polish.ts    # Heading styling, syntax dimming
│   │   └── manager.ts            # Decoration lifecycle management
│   ├── commands/
│   │   ├── track-changes.ts      # Insert/delete/substitute recording
│   │   ├── comments.ts           # Add/edit/resolve comments
│   │   ├── tables.ts             # Table structure operations
│   │   ├── frontmatter.ts        # YAML frontmatter insertion/editing
│   │   ├── formatting.ts         # Whitespace, horizontal rules, etc.
│   │   └── claude.ts             # Claude Code dispatch commands
│   ├── providers/
│   │   ├── codelens.ts           # Accept/Reject, table ops, @claude tags
│   │   ├── hover.ts              # Comment tooltips, change details
│   │   └── completions.ts        # Frontmatter templates, etc.
│   ├── parsers/
│   │   ├── criticmarkup.ts       # Parse CriticMarkup ranges
│   │   ├── markdown-table.ts     # Parse/serialize markdown tables
│   │   └── frontmatter.ts        # Parse/serialize YAML frontmatter
│   ├── claude/
│   │   ├── dispatch.ts           # Send prompts to Claude Code terminal
│   │   ├── context-buffer.ts     # Multi-selection context staging
│   │   ├── file-watcher.ts       # Detect Claude Code file mutations
│   │   └── annotations.ts        # @claude tag collection and dispatch
│   ├── google/
│   │   ├── pairing.ts            # Frontmatter URL pairing management
│   │   ├── sync-status.ts        # Sync state tracking and status bar
│   │   └── diff-resolve.ts       # Three-way merge for md ↔ Google Docs
│   └── sidebar/
│       └── changes-panel.ts      # Webview sidebar for changes overview
├── package.json                  # Contribution points, activation events
├── CLAUDE.md                     # Claude Code project instructions
└── tsconfig.json
```

### 3.2 Key VS Code APIs

|API                                                |Used For                                                                     |
|---------------------------------------------------|-----------------------------------------------------------------------------|
|`editor.setDecorations` / `DecorationRenderOptions`|Hiding CriticMarkup syntax, styling tracked changes, dimming markdown markers|
|`vscode.languages.registerCodeLensProvider`        |Accept/Reject buttons, contextual table operations, @claude actions          |
|`vscode.languages.registerHoverProvider`           |Comment text on hover, change metadata                                       |
|`vscode.commands.registerCommand`                  |All user-facing operations                                                   |
|`vscode.window.onDidChangeTextEditorSelection`     |Context-aware toolbar state                                                  |
|`vscode.workspace.onDidChangeTextDocument`         |Track changes recording, decoration refresh                                  |
|`vscode.window.createTerminal` / `sendText`        |Claude Code dispatch                                                         |
|`vscode.window.registerWebviewViewProvider`        |Changes sidebar panel                                                        |
|`vscode.FileSystemWatcher`                         |Detect external file mutations (Claude Code edits)                           |
|`editor title` contribution point                  |Toolbar buttons scoped to markdown                                           |
|`editor/context` contribution point                |Right-click menu items                                                       |
|`menus.commandPalette`                             |All commands accessible via Cmd+Shift+P                                      |

### 3.3 Libraries

> **Instruction to Claude Code:** Use these libraries. Do not reimplement what they provide.

|Library                                                    |Purpose                                                   |Install                  |
|-----------------------------------------------------------|----------------------------------------------------------|-------------------------|
|[`vscode-uri`](https://github.com/microsoft/vscode-uri)    |URI handling for file paths                               |`npm install vscode-uri` |
|[`yaml`](https://github.com/eemeli/yaml)                   |Parse/serialize YAML frontmatter with comment preservation|`npm install yaml`       |
|[`markdown-it`](https://github.com/markdown-it/markdown-it)|Markdown parsing for table detection, heading structure   |`npm install markdown-it`|
|[`diff`](https://github.com/kpdecker/jsdiff)               |Character-level diffing for track changes recording       |`npm install diff`       |
|[`picomatch`](https://github.com/micromatch/picomatch)     |Glob matching for file scoping                            |`npm install picomatch`  |


> **Note on CriticMarkup parsing:** There is no robust, maintained npm library for CriticMarkup. Implement a regex-based parser (the syntax is simple and well-specified — five patterns). Reference the [CriticMarkup spec](https://criticmarkup.com/spec.php) directly. The five patterns are:
> 
> - Addition: `{++ added text ++}`
> - Deletion: `{-- deleted text --}`
> - Substitution: `{~~ old text ~> new text ~~}`
> - Comment: `{>> comment text <<}`
> - Highlight: `{== highlighted text ==}{>> optional comment <<}`

-----

## 4. Feature Specification

### 4.1 Markdown Polish (Phase 1)

Visual improvements to the native markdown editing experience using decorations only — no file modifications.

**Heading styling:**

- Apply bold weight and increased opacity to `# Heading` lines via decoration CSS
- When cursor is NOT on the line: dim the `#` markers (reduced opacity) so the heading text dominates
- When cursor IS on the line: `#` markers return to full opacity for easy editing/removal
- Use distinct `color` per heading level (configurable, ship with sensible defaults)

**Syntax marker expand-on-cursor (core UX pattern):**

This is the fundamental interaction model for the entire extension. All syntax markers — bold, italic, links, code spans, headings, list markers, CriticMarkup — follow the same rule:

- **Cursor away:** Syntax characters (`**`, `_`, ```, `[`, `](url)`, `>`, `-`) are hidden or dimmed. The user sees styled text that looks close to rendered markdown.
- **Cursor on the element (line or inline span):** Syntax characters expand back to full visibility and opacity so the user can read, edit, or remove them. The cursor can navigate through all characters normally.
- Implemented via `onDidChangeTextEditorSelection` — recompute decorations on every cursor move. Use `requestAnimationFrame`-style debouncing (1–2 frame delay) to avoid flicker during rapid navigation.

> **Instruction to Claude Code:** This expand-on-cursor behavior is the single most important UX detail in the extension. It must feel instant and flicker-free. Design the decoration manager (`decorations/manager.ts`) around this pattern from the start — every decoration provider registers both a “collapsed” and “expanded” decoration set, and the manager swaps between them based on cursor position. Use `TextEditorDecorationType` pairs (one for away, one for active) rather than rebuilding decoration arrays on every cursor move.

Specific inline elements and their collapsed/expanded states:

|Element       |Cursor Away (collapsed)                                           |Cursor On (expanded)                           |
|--------------|------------------------------------------------------------------|-----------------------------------------------|
|`**bold**`    |**bold** (markers hidden via opacity: 0, text styled bold)        |`**bold**` (markers visible, text still bold)  |
|`_italic_`    |*italic* (markers hidden, text styled italic)                     |`_italic_` (markers visible, text still italic)|
|``code``      |`code` (markers hidden, text gets code background)                |``code`` (markers visible, background remains) |
|`[link](url)` |link (markers + URL hidden, text styled as link color + underline)|`[link](url)` (full syntax visible)            |
|`![alt](img)` |alt (markers + URL hidden, image icon gutter indicator)           |`![alt](img)` (full syntax visible)            |
|`> blockquote`|blockquote (`>` dimmed, left border decoration)                   |`> blockquote` (`>` full opacity)              |
|`- list item` |list item (`- ` dimmed, bullet dot pseudo-element)                |`- list item` (`-` full opacity)               |
|`# Heading`   |Heading (`# ` dimmed, text styled with weight/color)              |`# Heading` (`#` full opacity)                 |

**Frontmatter treatment:**

- Detect code-fenced YAML block at file start (````` delimiters, not `---`)
- We use code fences instead of `---` because `---` renders as a horizontal rule when markdown is imported into Google Docs, breaking the frontmatter block. Code fences survive the round-trip intact.
- Apply subtle background color and reduced font size to the entire block
- Add a CodeLens above the opening fence: “Edit Frontmatter” (opens Quick Pick)
- Recognize `google_doc_url` and `google_sheet_url` fields and render as clickable links in CodeLens: “Open in Google Docs” / “Open in Sheets”

**Horizontal rule rendering:**

- For `---` / `***` / `___` lines, apply a bottom border decoration and reduce text opacity
- Note: since frontmatter now uses code fences, `---` at the top of a file is unambiguously a horizontal rule unless it’s a legacy frontmatter block (which the parser detects separately)

### 4.2 Toolbar & Chrome (Phase 1)

**Configurable typeface:**

- The extension overrides VS Code’s `editor.fontFamily`, `editor.fontSize`, and `editor.lineHeight` for markdown files using a language-specific settings contribution.
- Default: Inter at 16px, line-height 1.6 — optimized for reading/writing prose rather than code.
- Users configure via `markdownCraft.typography.*` settings. The extension applies these as `[markdown]`-scoped editor config overrides.
- Ship a recommendation in the README for good knowledge-work typefaces: Inter, iA Writer Quattro, Charter, Literata, Source Serif 4.

> **Instruction to Claude Code:** Use VS Code’s `configurationDefaults` contribution point to set language-specific editor overrides for `[markdown]`. Read the user’s `markdownCraft.typography.*` settings and apply them. This means a user can have JetBrains Mono for code files and Inter for markdown files without switching profiles.

**Save indicator:**

- Editor title bar includes a save state indicator, always visible for markdown files.
- **Unsaved changes:** `$(circle-filled)` icon (filled dot), colored to match the theme’s modified indicator. Clicking it saves the file (`workbench.action.files.save`).
- **Saved / clean:** `$(check)` icon (checkmark), dimmed. Not clickable (or click is a no-op).
- Implemented via a dynamic editor title action whose icon and tooltip update on `onDidChangeTextDocument` (dirty) and `onDidSaveTextDocument` (clean).

Editor title actions (icons, scoped to `resourceLangId == markdown`):

|Icon                           |Command                          |Behavior                                                                                                                                                                                         |
|-------------------------------|---------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|`$(circle-filled)` / `$(check)`|`markdownCraft.saveIndicator`    |Shows unsaved (dot) / saved (check) state. Click saves when dirty.                                                                                                                               |
|`$(eye)`                       |`markdownCraft.togglePreview`    |Opens VS Code’s built-in side preview (`markdown.showPreviewToSide`)                                                                                                                             |
|`$(list-flat)`                 |`markdownCraft.insertFrontmatter`|Quick Pick with templates: blank, blog post, PRD, research note. Inserts at file start if none exists; opens edit UI if exists                                                                   |
|`$(table)`                     |`markdownCraft.tableMenu`        |Quick Pick: Insert Table (prompts for rows/cols), or if cursor is in a table: Add Row Above, Add Row Below, Add Column Left, Add Column Right, Delete Row, Delete Column, Align Left/Center/Right|
|`$(blank)`                     |`markdownCraft.insertBlock`      |Quick Pick: Horizontal Rule, Code Block (prompts for language), Blockquote, Callout/Admonition, Table of Contents marker                                                                         |

Context menu items (right-click inside a markdown table):

- Add Row Above / Below
- Add Column Left / Right
- Delete Row / Delete Column
- Sort Column Ascending / Descending

### 4.3 Table Operations (Phase 1)

> **Instruction to Claude Code:** Markdown tables are text structures. All operations are text manipulations — parse the table into a 2D array, perform the operation, serialize back with aligned columns. Use `markdown-it` to detect table boundaries. Write a dedicated parser/serializer in `parsers/markdown-table.ts` that handles alignment markers (`:---`, `:---:`, `---:`).

- **Insert Table:** Prompt for rows × columns via Quick Input. Generate a properly formatted markdown table with header row, separator row, and empty body rows. Place cursor in first body cell.
- **Add Row:** Parse current table, insert empty row at specified position, re-serialize.
- **Add Column:** Parse current table, insert empty column at specified position, re-serialize with updated alignment row.
- **Delete Row/Column:** Parse, remove, re-serialize. Prevent deletion of header row or last remaining column.
- **Auto-align on save:** Register a `onWillSaveTextDocument` handler that detects all tables in the document and re-aligns column widths using padding. Make this configurable (on/off).

### 4.4 Frontmatter Management (Phase 2)

> **Instruction to Claude Code:** Use the `yaml` library for parsing and serialization. Preserve comments in YAML when editing. Frontmatter uses triple-backtick code fence delimiters (`````), NOT triple-dash (`---`). This is a deliberate choice: `---` renders as a horizontal rule in Google Docs, breaking frontmatter on round-trip. Code fences survive intact. The parser in `parsers/frontmatter.ts` must detect both formats on read (for compatibility with existing files) but always write code fences.

**Frontmatter delimiter format:**

```
` `` `
title: My Document
date: 2026-03-21
tags: []
` `` `
```

**Google Workspace pairing fields:**

- `google_doc_url` — URL of the paired Google Doc (optional)
- `google_sheet_url` — URL of the paired Google Sheet (optional)
- `google_sync_status` — `synced`, `local-ahead`, `remote-ahead`, `conflict` (managed by extension/sync tooling)
- `google_last_synced` — ISO 8601 timestamp of last successful sync

When a `google_doc_url` or `google_sheet_url` is present:

- CodeLens renders a clickable “Open in Google Docs” / “Open in Sheets” action above the frontmatter
- Status bar shows sync status indicator
- Future phases will add programmatic sync; for now, these fields are informational and updated manually or via Claude Code skills
- **Insert Frontmatter:** If no frontmatter exists, insert a template. Templates are defined in extension settings as named YAML snippets. Ship with defaults:
  - **Blank:** ```` \ntitle: \ndate: {today}\ntags: []\n ````
  - **PRD:** ```` \ntitle: \nstatus: draft\nowner: \nstakeholders: []\nlast-reviewed: {today}\n ````
  - **Research Note:** ```` \ntitle: \nsource: \ndate: {today}\ntags: []\nrelevance: \n ````
  - **Blog Post:** ```` \ntitle: \ndate: {today}\ndraft: true\ntags: []\ndescription: \n ````
  - **Google Doc Paired:** ```` \ntitle: \ndate: {today}\ntags: []\ngoogle_doc_url: \ngoogle_sync_status: unsynced\n ````
- **Edit Frontmatter:** Parse existing frontmatter, present as a series of Quick Input prompts (one per field). Serialize back.
- **Link Google Doc:** Command that prompts for a Google Docs/Sheets URL and adds it to the frontmatter. Validates URL format (must match `https://docs.google.com/document/d/` or `https://docs.google.com/spreadsheets/d/`).
- **Custom Templates:** Users can define additional templates in settings.

### 4.5 CriticMarkup Decorations (Phase 2)

The rendering layer for track changes and comments. This phase is display-only — the user can manually write CriticMarkup and see it rendered. CriticMarkup decorations follow the same **expand-on-cursor** pattern defined in §4.1: syntax markers are hidden when the cursor is away, and expand to full visibility when the cursor enters the CriticMarkup span.

**Decoration rules (cursor away / collapsed):**

|CriticMarkup        |Visual Rendering                                                                                               |
|--------------------|---------------------------------------------------------------------------------------------------------------|
|`{++ text ++}`      |Green text, light green background. `{++` and `++}` hidden.                                                    |
|`{-- text --}`      |Red text, strikethrough, light red background. `{--` and `--}` hidden.                                         |
|`{~~ old ~> new ~~}`|`old` rendered as deletion (red strikethrough), `new` rendered as insertion (green). `{~~`, `~>`, `~~}` hidden.|
|`{>> comment <<}`   |Entire span hidden in editor. Gutter icon (speech bubble) on the line. Tooltip on hover shows comment text.    |
|`{== text ==}`      |Yellow/amber background highlight. `{==` and `==}` hidden.                                                     |

**Cursor on (expanded):** When the cursor enters any CriticMarkup span, the full syntax is revealed — `{++ text ++}`, `{-- text --}`, etc. — so the user can read, edit, or delete the markup directly. Styled content (colors, strikethrough, backgrounds) remains applied even in expanded state, so the user always understands the semantic meaning while editing.

**Special case for comments:** Since `{>> comment <<}` is fully hidden when collapsed, the gutter icon is the primary affordance for discovering comments. Clicking the gutter icon places the cursor inside the comment span, which triggers expansion. The user can then edit the comment text or delete the entire annotation.

**CodeLens actions** — shown above each CriticMarkup range:

|Label   |Action                                                                                                                                               |
|--------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
|✓ Accept|For additions: remove markers, keep text. For deletions: remove entire markup including text. For substitutions: keep new text, remove old + markers.|
|✗ Reject|Inverse of Accept.                                                                                                                                   |
|💬 (n)   |Comment count indicator. Click to show all comments in a hover panel.                                                                                |

**Global actions** (command palette + toolbar when track changes are detected):

- Accept All Changes
- Reject All Changes
- Next Change / Previous Change (keyboard navigable)

### 4.6 Track Changes Recording (Phase 3)

The authoring layer — the extension records user edits as CriticMarkup.

**Toggle:** “Track Changes” button in editor title bar. Visual indicator (icon color change) when active. State persisted per-file in workspace storage.

**Recording behavior:**

When track changes is ON:

1. Hook `onDidChangeTextDocument` to capture every edit.
1. Use the `jsdiff` library to compute character-level diffs between the previous and current document state.
1. Wrap deletions in `{-- --}` and insertions in `{++ ++}`.
1. For replacements (selection overwrite), use substitution syntax `{~~ old ~> new ~~}`.
1. Consolidate adjacent same-type changes to avoid excessive fragmentation.

**Edge cases to handle:**

- **Paste:** A paste that replaces a selection should produce a single substitution, not a deletion + insertion.
- **Undo/redo:** Undoing a tracked change should remove the CriticMarkup wrapping, not create a new inverse change.
- **Editing inside existing CriticMarkup:** If the cursor is inside an existing `{++ ++}` block and the user types more, extend the block rather than nesting.
- **Multi-cursor:** Each cursor’s edit is tracked independently.
- **Auto-save interaction:** Track changes recording should be compatible with auto-save. The CriticMarkup is part of the file content.

> **Instruction to Claude Code:** This is the hardest part of the extension. Build it incrementally: start with simple insertions only, then deletions, then substitutions. Write thorough unit tests for the `diff → CriticMarkup wrapping` logic before integrating with the editor event system. Use the `diff` library’s `diffChars` or `diffWords` function as the foundation.

### 4.7 Comments UI (Phase 3)

**Add Comment:**

1. Select text (or place cursor on a line).
1. Invoke command (toolbar button, keyboard shortcut, or context menu).
1. Quick Input box appears prompting for comment text.
1. Extension wraps selection: `{>> comment text <<}` is appended after the selection, or for highlighted comments: `{== selected text ==}{>> comment text <<}`.
1. Decoration immediately renders: selection gets highlight background, comment is hidden with gutter indicator.

**Edit Comment:**

- Click gutter icon or invoke “Edit Comment” with cursor inside a comment range.
- Quick Input pre-filled with existing comment text.
- Updates the CriticMarkup in place.

**Resolve/Delete Comment:**

- CodeLens “Resolve” action removes the comment markup (and highlight markup if present), leaving the original text.
- CodeLens “Delete” removes comment and associated highlight, also leaving the original text.

**Comments Panel (sidebar):**

- Webview panel listing all comments in document order.
- Each entry shows: line number, commented text excerpt, comment text, and Resolve/Delete buttons.
- Clicking an entry navigates to that location in the editor.

### 4.8 Claude Code Integration — Simple (Phase 3)

> **Instruction to Claude Code:** All Claude Code dispatch works by creating or reusing a VS Code terminal and sending text to it. Check for an existing terminal named “Claude Code” before creating a new one. Use `vscode.window.activeTerminal` or find by name. The dispatch function should handle both scenarios: Claude Code already running (send as stdin) and Claude Code not running (launch with prompt).

**Commands:**

|Command                                |Trigger                       |Behavior                                                                                                               |
|---------------------------------------|------------------------------|-----------------------------------------------------------------------------------------------------------------------|
|`markdownCraft.askClaudeAboutFile`     |Editor title button `$(hubot)`|Sends: `claude "Review and provide feedback on this document" {filePath}`                                              |
|`markdownCraft.askClaudeAboutSelection`|Context menu on selection     |Quick Input for prompt, then sends: `claude "{prompt}\n\nContext from {filePath} lines {start}-{end}:\n{selectedText}"`|
|`markdownCraft.sendFileToClaudeContext`|Editor title button           |Sends: `/add {filePath}` to running Claude Code session (uses the add-file slash command)                              |
|`markdownCraft.fixFormatting`          |Command palette               |Sends: `claude "Fix markdown formatting in this file without changing content" {filePath}`                             |
|`markdownCraft.summarizeDocument`      |Command palette               |Sends: `claude "Provide a concise summary of this document" {filePath}`                                                |

### 4.9 Claude Code Integration — Medium (Phase 4)

**Context Buffer:**

- A staging area where the user accumulates selections before dispatching to Claude.
- `markdownCraft.addToContextBuffer` — adds current selection (with file path + line numbers) to an in-memory list.
- Status bar item shows buffer count: “Claude Context: 3 selections”
- `markdownCraft.dispatchContextBuffer` — opens Quick Input for the prompt, then sends all staged selections plus the prompt to Claude Code as a single message.
- `markdownCraft.clearContextBuffer` — resets the buffer.

**Rewrite Selection:**

- `markdownCraft.rewriteWithClaude` — sends selected text to Claude with the prompt “Rewrite this passage: [optional user instruction]”.
- When Claude Code finishes writing, trigger VS Code’s diff view comparing the file before and after.
- Uses a pre-edit snapshot saved to a temp file.

**Generate Section from Heading:**

- Detects when cursor is on an empty heading line (heading text followed by blank or next heading).
- CodeLens: “Generate with Claude”
- Sends: `claude "Write the '{headingText}' section for this document. Match the tone and style of existing content." {filePath}`

### 4.10 Claude Code Integration — Advanced (Phase 5)

**File Watcher / Review Loop:**

- `FileSystemWatcher` on the active file.
- When the file changes externally (Claude Code wrote to it), show a VS Code notification: “Claude modified {filename} — Review changes?”
- Notification actions: “Show Diff” (opens diff view against last known state), “Accept” (update internal state), “Revert” (undo the external change via Git).
- **Simple case (file is clean locally):** Diff is straightforward — show what Claude changed against the saved version.
- **Conflict case (file has unsaved local edits when Claude pushes changes):** This is a dirty-buffer conflict. See §4.11 for handling.

### 4.11 Claude Code Conflict Resolution (Phase 5/6)

> This is a known hard problem that gets its own subsection. When the user has unsaved edits in the editor buffer and Claude Code writes to the same file on disk, VS Code’s default behavior is to show a “file has been modified on disk” warning and offer to reload (losing buffer changes) or keep the buffer (ignoring Claude’s changes). Both options lose work. We need to do better.

**Phase 5 — basic conflict awareness:**

- Detect the conflict condition: `FileSystemWatcher` fires while `document.isDirty === true`
- Show a notification with three actions:
  - “Show Three-Way Diff” — opens a diff view showing: (1) last saved version (common ancestor), (2) current buffer (your changes), (3) disk version (Claude’s changes)
  - “Keep Mine” — ignore the disk change, keep buffer. File on disk gets overwritten on next save.
  - “Keep Claude’s” — reload from disk, discarding buffer edits.
- Save a pre-conflict snapshot (the last saved version) to a temp file for the three-way diff base.

**Phase 6+ — merge-level conflict resolution:**

- Use `jsdiff` three-way merge to auto-resolve non-overlapping changes (your edits in paragraph 2, Claude’s edits in paragraph 5 → both apply cleanly).
- For overlapping changes, present them as CriticMarkup conflict markers in the editor:
  
  ```
  {~~ your version of this paragraph ~> Claude's version of this paragraph ~~}
  {>> CONFLICT: both you and Claude edited this section. Accept one version or manually merge. <<}
  ```
- User resolves conflicts using the standard Accept/Reject CriticMarkup UI.
- “Accept All Mine” / “Accept All Claude’s” bulk actions for quick resolution.

> **Instruction to Claude Code:** The conflict detection in Phase 5 is simple — just check `document.isDirty` when the file watcher fires. The merge logic in Phase 6+ is complex. Use `jsdiff`’s `structuredPatch` and `applyPatch` functions for the three-way merge, and represent unresolvable conflicts as CriticMarkup substitutions so the existing decoration and accept/reject infrastructure handles them.

**CriticMarkup Round-Trip:**

- `markdownCraft.sendChangesToClaude` — collects all CriticMarkup comments and tracked changes in the document, formats them as a revision checklist, and sends to Claude Code:
  
  ```
  claude "Address each of these editorial comments and tracked changes in {filePath}:
  
  Line 15: Comment: 'This needs a source citation'
  Line 23: Deletion suggested: 'redundant paragraph about...'
  Line 34: Comment: 'Expand on the methodology here'
  
  Make the edits directly in the file. Remove resolved CriticMarkup after addressing each item."
  ```
- After Claude finishes, the file watcher triggers the review loop.

**@claude Annotation Pipeline:**

- Register a CodeLens provider that detects `@claude` mentions anywhere in the document (including inside CriticMarkup comments).
- Pattern: `{>> @claude: do something <<}` or inline `<!-- @claude: do something -->`
- CodeLens above each: “Run” (dispatch this single annotation) or “Run All @claude Tasks” (batch dispatch).
- Batch dispatch collects all annotations and sends as a numbered task list to Claude Code.
- After Claude processes, resolved annotations can be marked (the extension prepends `@done` or removes them based on user preference).

**Session Handoff Document:**

- `markdownCraft.generateHandoff` — auto-generates a markdown handoff note capturing:
  - Current file and cursor position
  - List of unsaved changes
  - Pending CriticMarkup (unresolved comments and changes)
  - Pending @claude annotations
  - Git status (current branch, uncommitted files)
- Saves to `.claude/handoff.md` in the workspace root (or appends to CLAUDE.md).
- Claude Code can read this on next session start to understand context.

-----

## 5. Configuration / Settings

```jsonc
{
  // Typography
  "markdownCraft.typography.fontFamily": "Inter",  // Applied to markdown files via editor.fontFamily override
  "markdownCraft.typography.fontSize": 16,          // Applied via editor.fontSize override
  "markdownCraft.typography.lineHeight": 1.6,       // Applied via editor.lineHeight override

  // Decorations
  "markdownCraft.polish.dimSyntaxMarkers": true,
  "markdownCraft.polish.styleHeadings": true,
  "markdownCraft.polish.dimFrontmatter": true,
  
  // Table operations  
  "markdownCraft.tables.autoAlignOnSave": true,
  "markdownCraft.tables.defaultColumns": 3,
  "markdownCraft.tables.defaultRows": 3,

  // CriticMarkup colors (override defaults)
  "markdownCraft.criticmarkup.additionColor": "#2ea04370",
  "markdownCraft.criticmarkup.deletionColor": "#f8514970",
  "markdownCraft.criticmarkup.highlightColor": "#d29e2e50",
  "markdownCraft.criticmarkup.commentGutterIcon": true,

  // Track changes
  "markdownCraft.trackChanges.authorName": "Author",

  // Frontmatter templates (user-defined, merged with defaults)
  "markdownCraft.frontmatter.templates": {
    "Weekly Review": "```\ntitle: Weekly Review — {date}\nweek: \nhighlights: []\n```"
  },
  "markdownCraft.frontmatter.delimiter": "codefence",  // "codefence" (default) or "dashes" (legacy)

  // Google Workspace pairing
  "markdownCraft.google.showSyncStatus": true,
  "markdownCraft.google.showOpenInDocsCodeLens": true,

  // Claude Code integration
  "markdownCraft.claude.enabled": true,
  "markdownCraft.claude.terminalName": "Claude Code",
  "markdownCraft.claude.defaultPromptPrefix": "",
  "markdownCraft.claude.watchForExternalChanges": true,
  "markdownCraft.claude.annotationPattern": "@claude"
}
```

-----

## 6. Keyboard Shortcuts

|Shortcut       |Command                        |Context                                      |
|---------------|-------------------------------|---------------------------------------------|
|`Cmd+Shift+M`  |Toggle Preview                 |Markdown files                               |
|`Cmd+Shift+T`  |Toggle Track Changes           |Markdown files                               |
|`Cmd+Alt+C`    |Add Comment                    |Markdown files, text selected                |
|`Cmd+Alt+F`    |Insert/Edit Frontmatter        |Markdown files                               |
|`Cmd+Alt+T`    |Table Menu                     |Markdown files                               |
|`Cmd+Alt+Enter`|Insert Horizontal Rule         |Markdown files                               |
|`Cmd+]`        |Next Change                    |Markdown files with CriticMarkup             |
|`Cmd+[`        |Previous Change                |Markdown files with CriticMarkup             |
|`Cmd+Alt+A`    |Accept Change at Cursor        |Markdown files, cursor in CriticMarkup       |
|`Cmd+Alt+R`    |Reject Change at Cursor        |Markdown files, cursor in CriticMarkup       |
|`Cmd+Shift+L`  |Ask Claude About File          |Markdown files, Claude enabled               |
|`Cmd+Alt+L`    |Ask Claude About Selection     |Markdown files, Claude enabled, text selected|
|`Cmd+Alt+B`    |Add Selection to Context Buffer|Markdown files, Claude enabled               |

-----

## 7. Phased Roadmap

### Phase 1 — “A Better Markdown Editor” (Week 1–2)

**Goal:** Immediate quality-of-life improvements. No CriticMarkup, no Claude. Ship something useful fast.

- [ ] Extension scaffolding (yo code generator, TypeScript, esbuild bundler)
- [ ] Configurable typography: `[markdown]`-scoped font family, size, line height via `configurationDefaults`
- [ ] Save indicator in editor title bar (dirty dot / clean checkmark, click to save)
- [ ] Decoration manager with expand-on-cursor pattern (collapsed/expanded decoration pairs, cursor tracking with debounce)
- [ ] Markdown polish decorations: heading styling, inline element collapsing (bold, italic, code, links), list/blockquote marker dimming
- [ ] Expand-on-cursor for all inline elements per §4.1 table
- [ ] Toolbar buttons (preview toggle, frontmatter insert, table menu, block insert, save indicator)
- [ ] Table operations (insert, add/delete row/column, auto-align on save)
- [ ] Frontmatter templates with code fence delimiters (insert, edit via Quick Pick)
- [ ] Keyboard shortcuts for all Phase 1 commands
- [ ] Extension settings for all configurable values
- [ ] README with screenshots and feature list
- [ ] Publish to VS Code Marketplace

**Test criteria:** Install on a clean VS Code instance, open a markdown file with bold, italic, links, headings, and tables. Syntax markers collapse when cursor moves away and expand when cursor enters the element — transition must be flicker-free. Tables are correctly parsed and re-serialized with alignment preserved. All toolbar buttons and commands work.

### Phase 2 — “CriticMarkup Display” (Week 3–4)

**Goal:** Read and render CriticMarkup beautifully. Users can write CriticMarkup by hand (or receive it from tools) and see it rendered.

- [ ] CriticMarkup regex parser (all 5 patterns, including nested/multiline)
- [ ] Decoration provider for all CriticMarkup types
- [ ] Hidden syntax markers with visible styled content
- [ ] Gutter icons for comments
- [ ] Hover provider for comment text display
- [ ] CodeLens: Accept / Reject per change
- [ ] Commands: Accept All, Reject All, Next Change, Previous Change
- [ ] Comments panel (sidebar webview listing all comments)
- [ ] Unit tests for parser (edge cases: nested markup, multiline, escaped characters)

**Test criteria:** Open a file with all 5 CriticMarkup patterns. All render correctly. Accept/Reject produces clean output. Comments show on hover.

### Phase 3 — “Track Changes + Comments + Simple Claude” (Week 5–7)

**Goal:** The core editorial workflow. Users can toggle track changes, add comments through the UI, and send files to Claude Code.

- [ ] Track Changes toggle with visual indicator
- [ ] Edit recording: insertions wrapped in `{++ ++}`
- [ ] Edit recording: deletions wrapped in `{-- --}`
- [ ] Edit recording: substitutions (selection replacement) wrapped in `{~~ ~> ~~}`
- [ ] Edge case handling: paste, undo/redo, editing inside existing markup, multi-cursor
- [ ] “Add Comment” command with Quick Input
- [ ] “Add Highlight” command
- [ ] Edit Comment / Resolve Comment
- [ ] Simple Claude dispatch: Ask about file, ask about selection, send file to context, fix formatting, summarize
- [ ] Unit tests for track changes recording (diff → CriticMarkup wrapping)
- [ ] Integration tests for comment lifecycle (add, edit, resolve)

**Test criteria:** Enable track changes, make edits, verify CriticMarkup is correct. Add comments, verify they render and can be resolved. Send a file to Claude Code, verify the terminal receives the correct command.

### Phase 4 — “Claude as Collaborator” (Week 8–9)

**Goal:** Bidirectional Claude Code integration. Claude is a contextual writing partner.

- [ ] Context buffer: stage selections, dispatch with prompt
- [ ] Status bar indicator for buffer state
- [ ] Rewrite selection with Claude + diff view
- [ ] Generate section from heading (CodeLens on empty headings)
- [ ] Insert Claude response at cursor
- [ ] File watcher for external mutations + review notification
- [ ] Diff view triggered on external changes

**Test criteria:** Build up a context buffer from multiple selections across files, dispatch to Claude with a prompt. Claude rewrites a selection, diff view shows the change accurately. Claude modifies a file externally, notification appears with working diff.

### Phase 5 — “Agentic Workflows” (Week 10+)

**Goal:** The extension becomes a dispatch surface for agentic document work.

- [ ] CriticMarkup round-trip: send all comments/changes to Claude as a revision checklist
- [ ] @claude annotation detection (CodeLens provider)
- [ ] Single annotation dispatch (“Run”) and batch dispatch (“Run All”)
- [ ] Annotation resolution tracking (@done prefix or removal)
- [ ] Claude conflict detection: dirty-buffer awareness when file watcher fires (§4.11)
- [ ] Three-way diff view for Claude conflicts (last saved, buffer, disk)
- [ ] “Keep Mine” / “Keep Claude’s” quick resolution actions
- [ ] Session handoff document generation
- [ ] Multi-file knowledge operations (synthesize selected files via context menu)
- [ ] Bidirectional context sharing via CLAUDE.md sidecar updates

**Test criteria:** Write `{>> @claude: add a source citation <<}` in three places. “Run All” dispatches a task list to Claude. Claude resolves them, file watcher triggers review. Handoff document accurately captures workspace state. With unsaved local edits, Claude modifies the file — three-way diff appears with working Keep Mine / Keep Claude’s actions.

### Phase 6 — “Google Workspace Sync” (Week 12+)

**Goal:** Programmatic round-trip between local markdown files and paired Google Docs/Sheets. Resolve changes between the two versions using CriticMarkup as the diff representation.

> **Context:** Google Workspace CLI (gws) is currently blocked in the corporate environment. Today, sync is manual — users copy content between the two surfaces, and Claude Code skills assist with conversion. This phase designs for the future where CLI access is restored and sync can be automated. The architecture should be ready even if the CLI isn’t.

**Phase 6a — Manual sync with smart diffing (no CLI required):**

- [ ] Auto-merge for non-overlapping Claude conflicts: jsdiff three-way merge auto-applies clean changes, presents overlapping conflicts as CriticMarkup substitutions (§4.11)
- [ ] “Accept All Mine” / “Accept All Claude’s” bulk conflict actions
- [ ] “Compare with Google Doc” command: user pastes Google Doc content (or it’s read from clipboard), extension diffs against local markdown and presents changes as CriticMarkup
- [ ] Three-way merge UI: local version, Google version, and common ancestor (from `google_last_synced` snapshot)
- [ ] Accept/reject individual changes from the Google version using existing CriticMarkup UI
- [ ] Update `google_sync_status` and `google_last_synced` in frontmatter after resolution
- [ ] Snapshot storage: save a `.sync-snapshot` sidecar file (or Git-tracked copy) at each sync point for three-way merge base
- [ ] Markdown → Google Docs formatting considerations: strip/convert CriticMarkup before “push” (Google Docs has its own suggestion mode), preserve heading structure, handle table format differences
- [ ] Google Sheets pairing: for files paired with Sheets, define a table-focused sync (frontmatter + markdown tables ↔ sheet tabs)

**Phase 6b — Programmatic sync (requires GWS CLI or API access):**

- [ ] CLI adapter in `google/sync-cli.ts`: abstract over `gws` CLI commands (or future Google Drive API)
- [ ] “Push to Google Docs” command: convert markdown → Google Docs format, upload via CLI
- [ ] “Pull from Google Docs” command: download Google Doc → convert to markdown, diff against local, present as CriticMarkup
- [ ] Auto-sync on save (configurable): push local changes to paired Google Doc after save
- [ ] Conflict detection: if both local and Google versions changed since last sync, present three-way merge
- [ ] Batch sync: sync all paired files in workspace with a single command
- [ ] Google Sheets sync: push/pull markdown tables to/from specific sheet tabs

**Test criteria (6a):** Pair a local markdown file with a Google Doc URL. Make changes locally. Paste updated Google Doc content. Extension shows CriticMarkup diff. Accept/reject changes. Frontmatter sync status updates correctly.

**Test criteria (6b):** Push a local file to Google Docs via CLI. Make changes in Google Docs. Pull changes back. Three-way merge resolves correctly. Auto-sync on save works without data loss.

-----

## 8. CLAUDE.md — Project Instructions

> This section should be saved as the `CLAUDE.md` file in the extension repository root. It provides context and constraints for Claude Code when working on this project.

```markdown
# Markdown Craft — VS Code Extension

## What This Is
A VS Code extension for knowledge work in markdown. It layers editorial chrome
(toolbar, table ops, frontmatter management), CriticMarkup-based track changes,
and Claude Code integration on top of the native Monaco text editor.

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

## Code Style
- One module per feature area (see src/ directory structure in PRD)
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
```

-----

## 9. Open Questions

1. **Track changes + Git interaction:** When track changes are on and the user commits, should the CriticMarkup be stripped (accept-all) before commit, or committed as-is? Likely configurable, but what’s the default?
1. **Multi-author CriticMarkup:** The CriticMarkup spec doesn’t natively support author attribution. If we want to track who made which change (user vs. Claude), we need a convention — possibly `{++ text ++}{>> @author:claude <<}` or a metadata comment. What’s the right pattern?
1. **Performance at scale:** Large documents (1000+ lines) with many CriticMarkup ranges could make decoration updates expensive. Need to benchmark and possibly implement viewport-aware decoration (only decorate visible ranges + buffer).
1. **Nested CriticMarkup:** The spec doesn’t explicitly address nesting (e.g., a comment inside a tracked addition). Define behavior: allow or flatten?
1. **Frontmatter schema validation:** Should the extension validate frontmatter against a schema (e.g., required fields for a PRD template)? Could be a Phase 5+ feature.
1. **Claude Code protocol:** Currently the integration sends text to a terminal via `sendText`. If Claude Code exposes a programmatic API (SDK, socket, MCP) in the future, the dispatch layer should be swappable. Design the `claude/dispatch.ts` module with this in mind.
1. **Marketplace name:** “Markdown Craft” — need to verify availability on the VS Code Marketplace and npm.
1. **Frontmatter delimiter migration:** Existing files in home-brain and other repos use `---` delimiters. Should the extension offer a bulk migration command (“Convert all frontmatter to code fences”)? What about files shared with tools that only understand `---` (e.g., Jekyll, Hugo, Obsidian)?
1. **Google Docs → Markdown fidelity:** Google Docs has formatting that doesn’t map cleanly to markdown (colored text, nested tables, page breaks, images with captions). Define a lossy-but-predictable conversion strategy. What gets preserved, what gets stripped, what gets converted to comments/annotations?
1. **Google Docs suggestion mode ↔ CriticMarkup:** Google Docs has its own “suggestion” (track changes) system. On pull, should Google Doc suggestions be converted to CriticMarkup? On push, should CriticMarkup be converted to Google Doc suggestions? Or should changes always be resolved before sync?
1. **Sync conflict UX:** When both local and Google versions have changed, the three-way merge needs a clear UI. Is the existing CriticMarkup accept/reject CodeLens sufficient, or does this need a dedicated merge view (similar to Git merge conflict decorations)?
1. **Google Sheets pairing model:** For Sheets-paired files, what’s the data model? One table per sheet tab? Frontmatter maps to a metadata tab? How are non-table markdown sections (prose, headings) handled — ignored, stored in a notes column, or kept local-only?
1. **Expand-on-cursor scope:** Should expansion trigger when the cursor is anywhere on the line (simpler, Obsidian-like) or only when the cursor is within the specific inline span (more precise, Typora-like)? Line-level is easier to implement and less visually jarring for short lines; span-level is more precise for long paragraphs with many inline elements. Start with line-level and consider upgrading to span-level if users request it.
1. **Claude conflict resolution granularity:** When auto-merging non-overlapping changes (§4.11), what’s the unit of comparison — lines, paragraphs, or semantic blocks (headings + their content)? Line-level is safest but may produce false conflicts in rewrapped paragraphs. Paragraph-level is more natural for prose but harder to implement reliably. Start with paragraph-level (split on double newline) and fall back to line-level if it produces bad merges.
1. **Typography override scope:** The configurable typeface applies to all markdown files via `[markdown]` language scope. Should users be able to set per-folder or per-workspace typefaces (e.g., brainstem notes in one font, PRDs in another)? Likely overkill for v1 but worth considering the settings structure.

-----

## 10. What We Decided Against (and Why)

|Rejected Approach                         |Why                                                                                                                                                                                                                             |
|------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|Custom webview editor (ProseMirror/TipTap)|Loses native keybindings, vim mode, extension ecosystem. The whole point is to enhance the native editor, not replace it.                                                                                                       |
|Side-by-side preview as primary UX        |Users want inline visual improvements, not a second pane to monitor. The built-in preview is still available as a toggle.                                                                                                       |
|Custom comment storage format             |CriticMarkup is an existing, portable standard. Claude Code can read it natively. Inventing a new format creates a silo.                                                                                                        |
|LSP-based architecture                    |Overkill for a decoration + command extension. LSP adds complexity without benefit since we’re not doing diagnostics or cross-file analysis (in early phases).                                                                  |
|Electron-based companion app              |Adding a separate app defeats the purpose of staying in VS Code. The embedded terminal and sidebar webview provide enough surface area.                                                                                         |
|Real-time collaboration (Y.js)            |Out of scope. Git + CriticMarkup + Claude Code is the collaboration model.                                                                                                                                                      |
|Monaco font-size hacking for headings     |Monaco enforces a uniform line height grid. Attempting to vary font sizes via CSS injection is fragile and produces rendering glitches. Better to use color/weight/opacity for heading differentiation.                         |
|Google Docs API directly from extension   |GWS CLI is currently blocked in the corporate environment. Even when available, the extension should delegate sync to a CLI/skill layer rather than embedding OAuth and Drive API calls. Keeps the extension focused on editing.|
|Sidecar database for Google pairing       |Storing the pairing in frontmatter keeps everything in the file. A sidecar DB (.sqlite, .json) would create state that’s invisible to Git, Claude Code, and other tools.                                                        |
|`---` frontmatter delimiters              |Triple-dash renders as a horizontal rule in Google Docs, destroying frontmatter on round-trip. Code fences (`````) survive import/export intact. Compatibility: the parser reads both but always writes code fences.            |
|Real-time Google Docs co-editing          |Out of scope. The sync model is snapshot-based (push/pull), not live collaborative. Real-time co-editing would require the Docs API websocket, which is a different product.                                                    |

```

```
