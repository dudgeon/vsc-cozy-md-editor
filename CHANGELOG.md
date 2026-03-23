# Changelog

All notable changes to the Cozy MD Editor extension will be documented in this file.

## [0.3.0] - 2026-03-22

### Added

- Typography bundle system with two built-in presets: "Reader" (Newsreader headings + Plus Jakarta Sans body) and "Clean" (Inter). Custom user-defined bundles supported with full control over fonts, sizes, weights, and heading styles.
- MD/Cozy decoration toggle — toolbar button to switch between decorated (Cozy) and raw markdown (MD) editing modes
- Monospace font for table regions so pipe-delimited columns visually align (auto-switches from body font)
- Word occurrence highlighting disabled for markdown files (less visual noise)

### Changed

- Table CodeLens controls reordered: +Row, -Row, +Col, -Col (grouped by entity)
- Typography bundle "cozy" renamed to "reader" (settings auto-migrated)
- Preview button shortened to "Preview" (fixes toolbar text wrapping)
- Repo root tidied: assets, skills, and specs moved to docs/ and .claude/

### Fixed

- Settings migration for users who had the old "cozy" typography bundle name
- Preview button keybinding hint causing toolbar line wrap (issue #4)

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
