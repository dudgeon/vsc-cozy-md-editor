# Rich Text to Markdown Paste — Mini-PRD

**Status:** Spec complete, not started
**Phase:** 4 (UX Polish)
**Research:** [rich-text-paste-research.md](../research/rich-text-paste-research.md)

---

## Problem

Users copy text from web-based tools — Google Docs, Gmail, Confluence, GitHub
Pages — and paste it into markdown files. Today, VS Code pastes either raw HTML
(which renders as unreadable tag soup) or strips all formatting to plain text
(which loses structure the user spent time creating). Neither outcome is
acceptable for a tool whose target audience writes primarily in Google Docs and
is new to markdown.

A PM copying a product brief from Google Docs into a markdown file should get
clean, valid markdown — not a wall of `<span style="font-weight:700">` tags or
a flat block of unstyled text.

## Users

**Primary:** Product managers and non-developer knowledge workers who draft in
Google Docs or Gmail and move content into markdown files for version control,
Claude Code collaboration, or publishing workflows.

**Secondary:** Any VS Code user who copies formatted content from the web and
pastes into a `.md` file.

**Assumptions about the user:**
- They do not know what HTML is. They copied "bold text" and expect bold text.
- They will not manually clean up paste artifacts. If the paste is bad, they
  will either give up or switch back to Google Docs.
- They may not notice the paste widget (the small dropdown VS Code shows after
  pasting). The default behavior must be correct without any extra clicks.

## Solution

Register a `DocumentPasteEditProvider` that intercepts paste operations in
markdown files. When the clipboard contains `text/html`, convert it to clean
markdown using `turndown` + `linkedom` and insert the result. The user sees
the paste widget offering "Paste as Markdown" alongside VS Code's default
paste, with markdown conversion as the preferred option.

Source-specific preprocessors normalize messy HTML (especially Google Docs)
before conversion, so the output is clean regardless of where the user copied
from.

### Target paste sources (priority order)

1. **Google Docs** — Messy HTML with inline styles, class-based formatting,
   deeply nested tables. Needs preprocessing. Detect via
   `id="docs-internal-guid"` marker in pasted HTML.
2. **Gmail** — Relatively clean HTML, inline styles for bold/italic/links.
3. **Confluence** — Class-based HTML with custom data attributes
   (`class="confluenceTable"`). Needs preprocessing.
4. **GitHub Pages / general web** — Clean semantic HTML. Works well with
   default turndown.
5. **Gemini / AI outputs** — Often already markdown in plain text clipboard.
   May not need conversion (no `text/html` present, or trivial HTML wrapper).

## Scope

### Phase 1 — Core conversion
- Register `DocumentPasteEditProvider` for `text/html` in markdown files
- Convert bold, italic, links, headings, lists (ordered + unordered), inline
  code, fenced code blocks, blockquotes, horizontal rules
- Skip trivial HTML (plain text wrapped in `<p>` or `<span>` with no
  formatting) — let default paste handle it
- Yield to VS Code's built-in image paste provider
- User setting: `cozyMd.paste.convertHtmlToMarkdown` (boolean, default `true`)

### Phase 2 — Tables
- HTML `<table>` to markdown pipe tables via `@truto/turndown-plugin-gfm`
- Handle headerless tables (common in Google Sheets copies)
- Graceful fallback for merged/spanning cells (`colspan`/`rowspan`) that
  cannot be represented in markdown tables

### Phase 3 — Google Docs preprocessor
- Detect Google Docs source (`id="docs-internal-guid"`)
- Normalize `<b style="font-weight:normal">` wrappers (Docs wraps everything
  in `<b>` then overrides with inline CSS)
- Convert `<span style="font-weight:bold">` and `font-weight:700` to
  `<strong>`
- Convert `<span style="font-style:italic">` to `<em>`
- Fix invalid list nesting (Docs nests child `<ul>`/`<ol>` directly inside
  parent list, not inside `<li>`)
- Clean up non-breaking spaces and empty spans

### Phase 4 — Confluence preprocessor
- Detect Confluence source (`class="confluenceTable"` or similar markers)
- Normalize class-based formatting to semantic HTML before conversion
- Handle Confluence-specific table structures and data attributes

### Conversion matrix

| Source HTML | Markdown output |
|---|---|
| `<b>`, `<strong>`, `<span style="font-weight:bold">` | `**bold**` |
| `<i>`, `<em>`, `<span style="font-style:italic">` | `*italic*` |
| `<a href="url">text</a>` | `[text](url)` |
| `<h1>` through `<h6>` | `#` through `######` |
| `<ul>/<ol>/<li>` | `- ` / `1. ` (nested lists indented) |
| `<table>` | Markdown pipe table (Phase 2) |
| `<code>` | `` `code` `` |
| `<pre><code>` | Fenced code block (triple backtick) |
| `<blockquote>` | `> ` |
| `<hr>` | `---` |
| `<img src="url">` | Defer to VS Code's built-in image paste |
| `<del>`, `<s>` | `~~strikethrough~~` (via GFM plugin) |
| `<input type="checkbox">` in `<li>` | `- [ ]` / `- [x]` task list (via GFM plugin) |

## Technical Approach

### API

Use `DocumentPasteEditProvider` (stable since VS Code 1.82; project targets
`^1.85.0`). Register for `pasteMimeTypes: ['text/html']` scoped to
`{ language: 'markdown' }`. No package.json `contributes` entry needed — this
is a purely programmatic registration.

### Library stack

- **turndown** (~8 kB min+gzip) — HTML-to-markdown conversion with
  rule-based plugin system. 2.6M weekly downloads, battle-tested. The plugin
  system is essential for handling Google Docs quirks.
- **linkedom** (~200 kB) — Lightweight DOM parser for Node.js. Required
  because turndown operates on DOM nodes, not raw HTML strings. Chosen over
  jsdom (~2.5 MB) for size.
- **@truto/turndown-plugin-gfm** — Enhanced fork of turndown-plugin-gfm with
  20x faster table conversion, headerless table support, and `<br>` handling
  in cells.
- **@types/turndown** (dev dependency) — TypeScript definitions.

Estimated bundle impact: ~400 kB total (turndown + linkedom + GFM plugin).

### Alternative considered

**node-html-markdown** — No DOM dependency, ~113 kB total, 1.5x faster than
turndown. Rejected because its limited extensibility cannot handle Google Docs
HTML normalization. For a project where Google Docs is the primary copy source,
this is a dealbreaker. If Google Docs were not a priority, node-html-markdown
would be the better choice for its smaller footprint.

### Architecture

```
src/
├── paste/
│   ├── provider.ts           # DocumentPasteEditProvider implementation
│   ├── google-docs.ts        # Google Docs HTML normalization
│   ├── confluence.ts         # Confluence HTML normalization (Phase 4)
│   └── turndown-config.ts    # Turndown instance, custom rules, GFM plugin
```

Register in `extension.ts` alongside the other providers.

### Key implementation details

1. **Trivial HTML detection** — If the HTML is just a wrapper around plain text
   (single `<p>` or `<span>` with no formatting tags), return `undefined` and
   let default paste proceed. Avoids unnecessary conversion for code copied
   from VS Code's own editor.

2. **Image paste coexistence** — Use `yieldTo` on the `DocumentPasteEdit` to
   defer to VS Code's built-in image paste provider when clipboard contains
   image data.

3. **Google Docs detection** — Check for `id="docs-internal-guid"` in pasted
   HTML to activate Docs-specific preprocessing.

4. **Turndown configuration** — `headingStyle: 'atx'` (ATX headings),
   `codeBlockStyle: 'fenced'` (triple backtick), `bulletListMarker: '-'`
   (dash for unordered lists). These match Cozy MD Editor's conventions.

5. **Track changes interaction** — If track changes recording is active when
   the user pastes, the converted markdown is inserted as a normal edit. The
   snapshot+diff mechanism (Phase 3) captures it as a tracked addition. No
   special handling needed.

### Configuration

```json
{
  "cozyMd.paste.convertHtmlToMarkdown": {
    "type": "boolean",
    "default": true,
    "description": "Convert rich text (HTML) to markdown when pasting into markdown files"
  }
}
```

When disabled, the provider returns `undefined` for all paste operations and
VS Code's default paste behavior proceeds.

## Dependencies

| Package | Type | Size | Purpose |
|---|---|---|---|
| `turndown` | runtime | ~8 kB min+gzip | HTML-to-markdown conversion |
| `linkedom` | runtime | ~200 kB | DOM parser for turndown |
| `@truto/turndown-plugin-gfm` | runtime | ~5 kB | GFM tables, strikethrough, task lists |
| `@types/turndown` | devDependency | — | TypeScript definitions |

Install: `npm install turndown @truto/turndown-plugin-gfm linkedom && npm install -D @types/turndown`

## Non-Goals

- **Image paste** — VS Code handles this natively since 1.79. Our provider
  yields to the built-in image handler.
- **Two-way sync** — Converting markdown back to rich text for pasting into
  Google Docs or other targets is out of scope.
- **Real-time format detection** — No live preview of what the paste will
  produce. The paste widget is sufficient for choosing between options.
- **Clipboard preview command** — A "show what will be pasted" preview is a
  nice-to-have but not in initial scope.
- **Word / LibreOffice paste** — Not a target paste source. May work
  incidentally since these produce standard HTML, but not tested or optimized.
- **Custom turndown rules exposed as settings** — Power users can request this
  later. Initial implementation uses fixed, opinionated defaults.

## Success Criteria

1. **Google Docs smoke test:** Copy a paragraph from Google Docs containing
   bold text, an inline link, and a bulleted list. Paste into a markdown file.
   Result is clean, valid markdown with `**bold**`, `[text](url)`, and `- `
   list items. No HTML artifacts.

2. **Gmail smoke test:** Copy an email body with bold subject line, italic
   text, and a hyperlink. Paste produces clean markdown.

3. **Table test (Phase 2):** Copy a 3x3 table from Google Docs. Paste
   produces a properly aligned markdown pipe table with header separator.

4. **Plain text pass-through:** Copy plain text from a code editor. Paste
   behaves identically to default VS Code paste (no conversion triggered).

5. **Image coexistence:** Copy an image. VS Code's built-in image paste
   handler activates, not our HTML converter.

6. **Performance:** Paste conversion completes in under 100ms for a typical
   page of formatted content (~5KB HTML).

7. **Setting works:** With `cozyMd.paste.convertHtmlToMarkdown` set to
   `false`, all pastes use default VS Code behavior.

## Open Questions

1. **Default paste behavior** — Should "Paste as Markdown" be the automatic
   default, or should the user have to select it from the paste widget? The
   spec assumes default-on (with a setting to disable), but this is opinionated.
   Need to validate that users prefer automatic conversion over explicit opt-in.

2. **Nested formatting edge cases** — `<b><i>text</i></b>` should become
   `***text***`. Turndown handles this, but Google Docs sometimes produces
   deeply nested `<span>` trees that may not reduce cleanly. Need real-world
   testing with actual Docs HTML.

3. **Google Sheets tables** — Sheets copies include `<table>` HTML but with
   different structure than Docs tables. Should this use the same table
   pipeline or a separate preprocessor? Research needed during Phase 2.

4. **Frontmatter interaction** — If a user pastes content that includes a
   YAML frontmatter block (e.g., from another markdown file rendered as HTML),
   should we detect and handle it specially? Probably not in initial scope, but
   worth noting.

5. **Undo behavior** — Pasting converted markdown is a single edit operation.
   Cmd+Z undoes the entire paste, which is correct. But should Cmd+Z then
   offer to re-paste as plain text? VS Code's paste widget already handles
   this, so likely no extra work needed.

6. **linkedom vs. future alternatives** — linkedom is actively maintained but
   is a meaningful chunk of bundle size (~200 kB). If a lighter DOM parser
   emerges or turndown adds raw-HTML support, revisit this dependency.
