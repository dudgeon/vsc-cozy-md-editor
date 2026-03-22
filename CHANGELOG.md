# Changelog

All notable changes to the Cozy MD Editor extension will be documented in this file.

## [0.2.0] - 2026-03-22

### Added

- Track changes recording with snapshot+diff approach — toggle recording on/off, and changes are captured as CriticMarkup when you commit
- Light/dark/auto theme toggle for editor styling
- Comments command (Cmd+Alt+M) for inline CriticMarkup comments

### Changed

- Improved expand-on-cursor decoration performance

## [0.1.0] - 2026-03-22

### Added

- Visual markdown rendering: hides syntax markers and shows formatted text (bold, italic, headings, links)
- Google Docs-style keyboard shortcuts (Cmd/Ctrl+B, I, K, etc.)
- Smart list continuation on Enter, with Tab/Shift+Tab for indentation
- Table support with toolbar for adding/removing rows and columns, Tab navigation between cells, and auto-alignment on save
- CriticMarkup track changes rendering: color-coded additions, deletions, substitutions, highlights, and comments
- Accept/reject individual or all tracked changes
- Frontmatter insertion with templates and shortcuts
- Blockquote toggling
- Horizontal rule insertion
- Claude Code integration commands (ask about file, ask about selection, context buffer)
- Google Docs URL pairing via frontmatter metadata
- Configurable typography (font family, size, line height)
- Configurable CriticMarkup colors
