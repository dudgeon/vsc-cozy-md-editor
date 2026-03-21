# Markdown Craft

A VS Code extension for knowledge work in markdown. Markdown Craft layers editorial tools -- toolbar, table operations, frontmatter management, CriticMarkup-based track changes, and Claude Code integration -- on top of the native Monaco text editor.

All editing happens in the standard VS Code text editor. No custom webview editors, no hidden state. The file on disk is always the source of truth.

## Features

### Markdown Polish

- **Heading styling** -- visual weight applied to headings directly in the editor
- **Syntax dimming** -- markdown syntax markers (bold, italic, links, etc.) are dimmed for a cleaner editing experience
- **Expand-on-cursor** -- syntax markers are hidden or dimmed when the cursor is elsewhere, and fully revealed when the cursor enters the element. This applies to all decorated elements including headings, formatting, links, and CriticMarkup blocks.

### Tables

- Insert new tables with configurable default dimensions
- Add and remove rows and columns
- Column alignment support
- Auto-align table columns on save

### Frontmatter

- Insert and edit YAML frontmatter blocks
- Uses code fence delimiters (` ``` `) instead of triple-dash (`---`) to ensure compatibility with Google Docs round-tripping (where `---` renders as a horizontal rule)
- Reads both code fence and triple-dash formats for compatibility
- Frontmatter blocks are visually dimmed to reduce noise

### CriticMarkup Track Changes

Full support for the [CriticMarkup](https://criticmarkup.com/) specification:

- **Additions** -- `{++ added text ++}`
- **Deletions** -- `{-- deleted text --}`
- **Substitutions** -- `{~~ old text ~> new text ~~}`
- **Comments** -- `{>> comment text <<}`
- **Highlights** -- `{== highlighted text ==}{>> optional comment <<}`

Track changes can be toggled on/off, and individual changes can be accepted or rejected. Navigation between changes is supported via keyboard shortcuts.

### Claude Code Integration (Planned)

- Dispatch prompts to Claude Code from within the editor
- Stage multi-selection context in a buffer before dispatching
- File watcher to detect external mutations made by Claude
- `@claude` annotation tags for agentic workflows
- Degrades gracefully when Claude Code is not installed

### Google Docs/Sheets Sync (Planned)

- Pair markdown files with Google Docs/Sheets via frontmatter URL fields
- Sync status tracking in the status bar
- Three-way merge for resolving conflicts between local and remote changes
- Degrades gracefully when sync CLI is unavailable

## Installation

### VS Code Marketplace

Not yet published. Marketplace availability is planned for a future release.

### From .vsix File

```sh
code --install-extension markdown-craft-0.1.0.vsix
```

To build the .vsix file yourself, see the [Development](#development) section.

### From Source

```sh
git clone <repository-url>
cd vsc-cozy-md-editor
npm install
npm run build
```

Then press **F5** in VS Code to launch the Extension Development Host with the extension loaded.

## Usage

### Keyboard Shortcuts

| Command              | Windows / Linux     | macOS               |
|----------------------|---------------------|---------------------|
| Toggle Preview       | `Ctrl+Shift+M`     | `Cmd+Shift+M`      |
| Toggle Track Changes | `Ctrl+Shift+T`     | `Cmd+Shift+T`      |
| Add Comment          | `Ctrl+Alt+C`       | `Cmd+Alt+C`        |
| Insert Frontmatter   | `Ctrl+Alt+F`       | `Cmd+Alt+F`        |
| Table Menu           | `Ctrl+Alt+T`       | `Cmd+Alt+T`        |
| Next Change          | `Ctrl+]`           | `Cmd+]`            |
| Previous Change      | `Ctrl+[`           | `Cmd+[`            |
| Accept Change        | `Ctrl+Alt+A`       | `Cmd+Alt+A`        |
| Reject Change        | `Ctrl+Alt+R`       | `Cmd+Alt+R`        |

All keyboard shortcuts are scoped to markdown files only.

### Commands

All commands are available via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) under the **Markdown Craft** category:

- **Toggle Preview** -- toggle the markdown preview pane
- **Toggle Track Changes** -- enable or disable track changes recording
- **Add Comment** -- add a CriticMarkup comment to the current selection
- **Accept Change / Reject Change** -- resolve individual tracked changes
- **Accept All Changes / Reject All Changes** -- resolve all tracked changes at once
- **Next Change / Previous Change** -- navigate between tracked changes
- **Insert Frontmatter** -- insert a YAML frontmatter block
- **Table Menu** -- open the table operations menu
- **Insert Block** -- insert a content block
- **Ask Claude About File / Selection** -- send file or selection context to Claude
- **Add to Context Buffer / Dispatch / Clear** -- stage and send multi-selection context to Claude

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `markdownCraft.typography.fontFamily` | string | `Inter` | Font family for the markdown editor |
| `markdownCraft.typography.fontSize` | number | `16` | Font size for the markdown editor |
| `markdownCraft.typography.lineHeight` | number | `1.6` | Line height for the markdown editor |
| `markdownCraft.polish.dimSyntaxMarkers` | boolean | `true` | Dim markdown syntax markers for a cleaner editing experience |
| `markdownCraft.polish.styleHeadings` | boolean | `true` | Apply visual styling to headings |
| `markdownCraft.polish.dimFrontmatter` | boolean | `true` | Dim frontmatter blocks for reduced visual noise |
| `markdownCraft.tables.autoAlignOnSave` | boolean | `true` | Automatically align table columns on save |
| `markdownCraft.tables.defaultColumns` | number | `3` | Default number of columns when inserting a new table |
| `markdownCraft.tables.defaultRows` | number | `3` | Default number of rows when inserting a new table |
| `markdownCraft.criticmarkup.additionColor` | string | `rgba(0, 128, 0, 0.3)` | Background color for CriticMarkup additions |
| `markdownCraft.criticmarkup.deletionColor` | string | `rgba(255, 0, 0, 0.3)` | Background color for CriticMarkup deletions |
| `markdownCraft.criticmarkup.highlightColor` | string | `rgba(255, 255, 0, 0.3)` | Background color for CriticMarkup highlights |
| `markdownCraft.criticmarkup.commentGutterIcon` | string | `comment` | Gutter icon to use for CriticMarkup comments |
| `markdownCraft.trackChanges.authorName` | string | `Author` | Author name used when tracking changes |
| `markdownCraft.frontmatter.delimiter` | string | `codefence` | Delimiter style for frontmatter blocks (`codefence` or `dashes`) |
| `markdownCraft.claude.enabled` | boolean | `true` | Enable Claude AI integration |
| `markdownCraft.claude.terminalName` | string | `Claude` | Name of the terminal used for Claude interactions |
| `markdownCraft.claude.watchForExternalChanges` | boolean | `true` | Watch for external file changes made by Claude |
| `markdownCraft.google.showSyncStatus` | boolean | `false` | Show Google Docs sync status in the editor |
| `markdownCraft.google.showOpenInDocsCodeLens` | boolean | `false` | Show a CodeLens to open the file in Google Docs |

## CriticMarkup Reference

[CriticMarkup](https://criticmarkup.com/spec.php) is a plain-text markup format for tracking editorial changes. Markdown Craft uses it as the storage format for all track changes and comments.

| Markup Type   | Syntax                                        | Purpose                        |
|---------------|-----------------------------------------------|--------------------------------|
| Addition      | `{++ added text ++}`                          | Mark inserted text             |
| Deletion      | `{-- deleted text --}`                        | Mark removed text              |
| Substitution  | `{~~ old text ~> new text ~~}`                | Mark replaced text             |
| Comment       | `{>> comment text <<}`                        | Attach a comment               |
| Highlight     | `{== highlighted text ==}{>> comment <<}`     | Highlight with optional comment|

Because CriticMarkup is stored as plain text in the markdown file, tracked changes are portable and version-control friendly.

## Development

### Prerequisites

- Node.js (v20+)
- VS Code (v1.85.0+)

### Build Commands

```sh
npm install              # Install dependencies
npm run build            # Production build via esbuild
npm run watch            # Development build with file watching
npm run lint             # Run ESLint
npm run test             # Run unit tests (Mocha)
npm run test:integration # Run VS Code integration tests
npm run package          # Package as .vsix for distribution
```

### Running in Development

Press **F5** in VS Code to launch the Extension Development Host with the extension loaded. Use `npm run watch` for automatic rebuilds during development.

## Architecture

The extension is organized by feature area:

- `src/extension.ts` -- activation and command registration
- `src/decorations/` -- decoration providers for CriticMarkup rendering and markdown polish
- `src/commands/` -- command implementations (track changes, comments, tables, frontmatter, formatting)
- `src/providers/` -- CodeLens, hover, and completion providers
- `src/parsers/` -- parsers for CriticMarkup, markdown tables, and YAML frontmatter
- `src/claude/` -- Claude Code dispatch, context buffer, and file watcher
- `src/google/` -- Google Docs/Sheets pairing and sync
- `src/sidebar/` -- webview sidebar for changes overview

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation, technical decisions, and design constraints.

## License

MIT
