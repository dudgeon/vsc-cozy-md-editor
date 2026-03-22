# Rich Text to Markdown Paste — Research Report

**Date:** 2026-03-22
**Status:** Research complete, ready for implementation planning
**Roadmap ref:** Phase 6, item #6

---

## 1. VS Code Paste API

### `DocumentPasteEditProvider` — the official API

VS Code provides `DocumentPasteEditProvider`, a stable API for intercepting copy
and paste operations in text documents. This is the correct (and only supported)
way to implement custom paste behavior in a VS Code extension.

**API status:**

| Milestone | VS Code version |
|---|---|
| Proposed API introduced | ~1.66 (early 2022) |
| Used internally by `markdown-language-features` for image paste | 1.79 (May 2023) |
| Finalized as stable API | 1.82 (August 2023) |
| `editor.pasteAs.preferences` setting added | 1.96 (November 2024) |
| Official sample published (`vscode-extension-samples/document-paste`) | 1.97 (January 2025) |

Cozy MD Editor's `engines.vscode` is `^1.85.0`, so the stable paste API is
available without any proposed-API opt-in.

### Key types (from `@types/vscode` in this project)

```typescript
// Registration — called once at activation
vscode.languages.registerDocumentPasteEditProvider(
  selector: DocumentSelector,       // e.g. { language: 'markdown' }
  provider: DocumentPasteEditProvider,
  metadata: DocumentPasteProviderMetadata
): Disposable;

// Metadata — declares what MIME types the provider handles
interface DocumentPasteProviderMetadata {
  readonly providedPasteEditKinds: readonly DocumentDropOrPasteEditKind[];
  readonly copyMimeTypes?: readonly string[];   // for prepareDocumentPaste
  readonly pasteMimeTypes?: readonly string[];   // for provideDocumentPasteEdits
}

// Provider interface
interface DocumentPasteEditProvider {
  // Optional: runs on copy, lets you add custom data to DataTransfer
  prepareDocumentPaste?(document, ranges, dataTransfer, token): void | Thenable<void>;

  // Runs on paste — return DocumentPasteEdit(s) with converted text
  provideDocumentPasteEdits?(document, ranges, dataTransfer, context, token): ProviderResult<DocumentPasteEdit[]>;

  // Optional: lazy-resolve expensive edits
  resolveDocumentPasteEdit?(pasteEdit, token): ProviderResult<DocumentPasteEdit>;
}

// The edit itself
class DocumentPasteEdit {
  title: string;                           // shown in paste widget
  kind: DocumentDropOrPasteEditKind;       // hierarchical kind identifier
  insertText: string | SnippetString;      // the converted markdown
  additionalEdit?: WorkspaceEdit;          // for side effects (e.g., save image files)
  yieldTo?: readonly DocumentDropOrPasteEditKind[];  // ordering vs. other providers
}
```

### How clipboard data flows

1. User copies rich text from any source (Google Docs, browser, Word).
2. The OS clipboard contains multiple representations: `text/plain`, `text/html`,
   possibly `image/png`, etc.
3. On paste, VS Code populates a `DataTransfer` object with these MIME types.
4. The provider declares `pasteMimeTypes: ['text/html']` in its metadata.
5. VS Code calls `provideDocumentPasteEdits` with the `DataTransfer`.
6. The provider reads HTML: `const htmlItem = dataTransfer.get('text/html');`
   then `const html = await htmlItem.asString();`.
7. The provider converts HTML to markdown and returns a `DocumentPasteEdit`.
8. VS Code applies the first edit by default and shows a paste widget (the
   small dropdown that appears after pasting) letting the user switch to
   other available paste options (e.g., "Paste as plain text" vs.
   "Paste as Markdown").

### Available clipboard MIME types

| MIME type | When present | Notes |
|---|---|---|
| `text/plain` | Always | Plain text fallback |
| `text/html` | When copying from rich text sources | The key one for this feature |
| `image/png` | When copying an image | Already handled by VS Code's built-in image paste (since 1.79) |
| `text/uri-list` | When dragging files from explorer | Not relevant here |
| `files` | External file drops | Not relevant here |

### `when` clause contexts

There are no paste-specific `when` clause contexts. The `DocumentPasteEditProvider`
registration uses a `DocumentSelector` (e.g., `{ language: 'markdown' }`) to scope
activation. The provider itself decides whether to return an edit based on the
`DataTransfer` contents — if there's no `text/html`, it simply returns `undefined`
and the default paste behavior proceeds.

### Paste widget UX

When multiple paste edits are available, VS Code shows a paste control widget
(small dropdown) after pasting. The user can also trigger it with Cmd+. The
`editor.pasteAs.preferences` setting (1.96+) lets users set a default preference.
This means we can offer "Paste as Markdown" as an option alongside VS Code's
built-in plain text paste without forcefully overriding anything.

---

## 2. HTML to Markdown Conversion Libraries

### Evaluation criteria

- **Bundle size** — Cozy MD is an esbuild-bundled VS Code extension; smaller is better
- **Accuracy** — especially with messy Google Docs HTML
- **Configurability** — custom rules for project-specific needs (CriticMarkup, code fence frontmatter)
- **GFM table support** — markdown tables from HTML `<table>` elements
- **Maintenance** — active project, recent releases, responsive to issues
- **Node.js + no DOM requirement** — must work in VS Code's extension host (Node process, no browser DOM)

### Library comparison

#### turndown

| Attribute | Value |
|---|---|
| npm | `turndown` |
| Version | 7.2.2 (October 2025) |
| Weekly downloads | ~2.6M |
| Unpacked size | 192 kB |
| Min+gzip | ~8 kB (estimate from bundlephobia) |
| License | MIT |
| Dependents | 65,400+ projects |
| DOM requirement | **Yes — requires a DOM parser** |

**Strengths:**
- Most widely adopted HTML-to-markdown library by a large margin
- Excellent rule-based plugin system — custom rules for any HTML pattern
- `turndown-plugin-gfm` adds table + strikethrough support
- Enhanced fork `@truto/turndown-plugin-gfm` offers 20x faster table conversion
- `@joplin/turndown-plugin-gfm` handles edge cases (tables without headers,
  newlines in cells, nested tables)
- Proven in production across thousands of projects

**Weaknesses:**
- **Requires a DOM environment.** Turndown operates on DOM nodes, not raw HTML
  strings. In Node.js, you need a DOM parser like `jsdom` or `linkedom`.
  `jsdom` is ~2.5 MB and heavy. `linkedom` is lighter (~200 kB) and faster.
  This is the main cost concern — turndown itself is small, but the DOM
  dependency adds weight.
- No built-in Google Docs normalization — needs custom rules for inline-style
  bold (`font-weight: bold` on `<span>`), Docs-specific `<b>` wrapper with
  `style="font-weight:normal"`, and class-based styling.

**Google Docs handling:**
Google Docs HTML is notoriously messy. Instead of semantic `<strong>`, Docs
wraps everything in `<b style="font-weight:normal">` and uses inline CSS
(`font-weight: 700`) or class-based styles on `<span>` elements. Turndown's
custom rule system can handle this with preprocessing, but it requires
explicit rules. The `mdconv` browser extension (ewilderj/mdconv) demonstrates
this pattern: it preprocesses Google Docs HTML to normalize spans before
passing to turndown.

#### node-html-markdown

| Attribute | Value |
|---|---|
| npm | `node-html-markdown` |
| Version | 1.3.0 |
| Weekly downloads | ~334K |
| Unpacked size | 113 kB |
| Min+gzip | ~10 kB |
| License | MIT |
| DOM requirement | **No — has its own built-in parser** |

**Strengths:**
- Fastest option — 1.5-1.6x faster than turndown (benchmarked by authors)
- **No external DOM dependency** — includes its own HTML parser, so it works
  in pure Node.js without jsdom/linkedom. This is a significant advantage for
  a VS Code extension.
- Smaller total bundle footprint (no DOM library needed)
- Designed for high-throughput server-side conversion

**Weaknesses:**
- Much smaller ecosystem than turndown (8x fewer downloads)
- Less extensible — no equivalent to turndown's rich plugin system
- No dedicated GFM table plugin (basic table support is built-in but less
  configurable)
- Fewer custom rule hooks for handling messy HTML like Google Docs output

#### rehype-remark (unified ecosystem)

| Attribute | Value |
|---|---|
| npm | `rehype-remark` |
| Version | 6.x |
| Weekly downloads | ~50K |
| License | MIT |
| DOM requirement | No (operates on ASTs) |

**Strengths:**
- Part of the unified/remark/rehype ecosystem — composable with hundreds of
  plugins for both HTML and markdown processing
- AST-based approach gives maximum control over the transformation
- No DOM dependency — parses HTML to hast (HTML AST), transforms to mdast
  (markdown AST), then serializes

**Weaknesses:**
- **Heavy dependency tree.** Pulling in `unified` + `rehype-parse` +
  `rehype-remark` + `remark-stringify` adds many packages. Total bundle
  impact is likely 200-400 kB depending on plugins.
- Steep learning curve — AST manipulation is powerful but verbose for simple
  use cases
- Slower than turndown or node-html-markdown for straightforward conversion
- Overkill for a paste handler that needs to run in <100ms

#### html-to-md

| Attribute | Value |
|---|---|
| npm | `html-to-md` |
| Version | 0.x |
| Weekly downloads | ~5K |
| License | MIT |
| DOM requirement | No |

**Strengths:**
- Simple API: `html2md(htmlString, options)`
- Lightweight, no DOM dependency
- Configurable with `skipTags`, `emptyTags`, `ignoreTags`, `aliasTags`

**Weaknesses:**
- Very small user base (~5K weekly downloads)
- Still in 0.x — not production-stable
- Limited table support
- No plugin system for custom rules
- Not well suited for messy real-world HTML (Google Docs, Word)

### Summary matrix

| Library | Bundle (with deps) | DOM needed | Extensibility | GFM tables | Google Docs | Maintenance |
|---|---|---|---|---|---|---|
| **turndown** + linkedom | ~400 kB | Yes (linkedom) | Excellent | Via plugin | Custom rules | Active |
| **turndown** + jsdom | ~2.7 MB | Yes (jsdom) | Excellent | Via plugin | Custom rules | Active |
| **node-html-markdown** | ~113 kB | No | Limited | Basic | Limited | Active |
| **rehype-remark** | ~300 kB | No | Excellent | Via plugins | Via plugins | Active |
| **html-to-md** | ~20 kB | No | Basic | Limited | Poor | Low activity |

---

## 3. What Other Extensions Do

### VS Code built-in (`markdown-language-features`)

VS Code's built-in markdown extension already uses `DocumentPasteEditProvider`
for image paste (since 1.79) and URL-over-selection paste. It does **not**
convert HTML to markdown. This means our provider would complement, not
conflict with, the built-in one.

### "Paste as Markdown" (digitarald)

- Marketplace: `digitarald.paste-as-markdown`
- Uses `DocumentPasteEditProvider` with `text/html` MIME type
- Converts rich text from Word, websites to markdown
- Proves the API pattern works in production

### "Paste Markdown" (R)

- Marketplace: `R.paste-markdown`
- Automatically converts HTML to markdown on paste in `.md` files
- Uses turndown for conversion

### "Markdown Paste" (telesoho)

- Marketplace: `telesoho.vscode-markdown-paste-image`
- Handles images, HTML, and rich text paste
- Uses turndown with turndown options exposed as settings
- Most feature-complete of the existing extensions

### "Markdown All in One" (yzhang)

- Does **not** handle HTML-to-markdown paste
- Handles URL paste over selected text (wraps in `[text](url)`)
- Different feature; not a competitor for rich text paste

### Key takeaway

Multiple shipping extensions prove this pattern works. They all use turndown.
None of them have Google Docs-specific preprocessing, which is an opportunity
for Cozy MD Editor to differentiate.

---

## 4. Edge Cases

### Tables from Google Docs / Sheets

**Should become markdown tables.** This is one of the highest-value conversions.

- Google Docs tables come as `<table>` elements with inline styles
- Google Sheets copies include `<table>` with `<td>` cells
- `turndown-plugin-gfm` handles basic `<table>` to markdown table conversion
- The `@truto/turndown-plugin-gfm` fork handles edge cases better (headerless
  tables, nested tables, `<br>` in cells) with 20x performance improvement
- Merged/spanning cells (`colspan`/`rowspan`) cannot be represented in markdown
  tables — these should fall back to simple text or warn the user

### Images

**Do not handle in this provider.** VS Code already has built-in image paste
support since 1.79 that saves images to the workspace and inserts markdown
image links. Our provider should yield to the built-in image paste provider
when the clipboard contains image data. Use the `yieldTo` property on our
`DocumentPasteEdit` to defer to image-specific providers.

### Pasting code from VS Code

**Should not trigger conversion.** When copying from VS Code's own editor,
the clipboard contains `text/plain` (the code) and potentially
`vscode/text` (internal VS Code mime type with metadata). It typically does
**not** contain `text/html` with meaningful markup. If it does (e.g., copy
from VS Code's terminal or output panel), the HTML is usually just
`<pre><code>` blocks, which turndown already handles correctly by producing
fenced code blocks.

Our provider should check: if the HTML is trivially wrapping plain text (e.g.,
a single `<pre>` or `<p>` with no formatting), skip conversion and let the
default plain text paste proceed. This avoids unnecessary processing.

### Partial formatting (bold/italic only)

**Should work transparently.** A paste that includes just `<b>some text</b>`
should produce `**some text**`. Turndown handles this natively. The provider
should not require structural HTML (headings, lists) to activate — any
`text/html` content should be converted.

### Headings

Google Docs uses `<h1>`-`<h6>` tags, which turndown converts to `#` headings
by default. This is correct behavior.

### Lists

Google Docs exports lists as `<ul>` / `<ol>` with `<li>` elements, but nests
child lists directly inside the parent list (not inside an `<li>`). This is
invalid HTML that some converters handle poorly. Turndown handles basic cases;
a preprocessing step to fix nesting would improve accuracy.

### Links

`<a href="...">` to `[text](url)` is turndown's core functionality. No issues.

### Horizontal rules

`<hr>` to `---` is handled natively by turndown.

### Nested formatting

`<b><i>text</i></b>` to `***text***` is handled natively by turndown.

---

## 5. Recommendation

### Library choice: turndown + linkedom

**turndown** is the right choice despite needing a DOM dependency:

1. **Extensibility is critical** for Google Docs HTML. No other library has a
   plugin/rule system that can handle the `<b style="font-weight:normal">`
   pattern, class-based bold/italic spans, and other Docs quirks. Cozy MD
   Editor's target audience (PMs writing in Google Docs) makes this a
   first-class requirement, not an edge case.

2. **Ecosystem advantage.** 2.6M weekly downloads, 65K dependents, active
   maintenance. Every competing VS Code extension uses turndown. Battle-tested.

3. **`turndown-plugin-gfm`** (or the `@truto/turndown-plugin-gfm` fork) gives
   us markdown table conversion for free.

4. Use **linkedom** (not jsdom) as the DOM parser. linkedom is ~200 kB, fast,
   and designed for exactly this use case (server-side HTML parsing without a
   full browser). jsdom at ~2.5 MB is overkill for paste conversion.

**Alternative considered:** `node-html-markdown` would avoid the DOM dependency
entirely and save ~300 kB of bundle size. But its limited extensibility means
Google Docs HTML would produce poor results, and there's no clean way to add
custom rules. For a project where Google Docs is the primary copy source, this
is a dealbreaker. If Google Docs support were not a priority, node-html-markdown
would be the better choice.

### Dependencies to add

```
npm install turndown @truto/turndown-plugin-gfm linkedom
npm install -D @types/turndown
```

Estimated bundle impact: ~400 kB (turndown ~8 kB + linkedom ~200 kB +
gfm plugin ~5 kB, plus overhead).

### API approach: `DocumentPasteEditProvider`

Register a provider scoped to `{ language: 'markdown' }` that listens for
`text/html` on paste. Return a `DocumentPasteEdit` with the converted
markdown as `insertText`.

### Skeleton implementation

```typescript
import * as vscode from 'vscode';
import TurndownService from 'turndown';
import { gfm } from '@truto/turndown-plugin-gfm';
import { parseHTML } from 'linkedom';

const PASTE_KIND = vscode.DocumentDropOrPasteEditKind.Empty.append(
  'markdown', 'richTextToMarkdown'
);

class RichTextPasteProvider implements vscode.DocumentPasteEditProvider {

  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
    this.turndown.use(gfm);
    this.addGoogleDocsRules();
  }

  async provideDocumentPasteEdits(
    document: vscode.TextDocument,
    ranges: readonly vscode.Range[],
    dataTransfer: vscode.DataTransfer,
    context: vscode.DocumentPasteEditContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.DocumentPasteEdit[] | undefined> {

    const htmlItem = dataTransfer.get('text/html');
    if (!htmlItem) return undefined;

    const html = await htmlItem.asString();
    if (!html || html.trim().length === 0) return undefined;

    // Skip trivial HTML (plain text wrapped in a single <p> or <span>)
    if (this.isTrivialHtml(html)) return undefined;

    // Parse HTML into a DOM using linkedom
    const { document: dom } = parseHTML(html);

    // Preprocess Google Docs quirks
    this.normalizeGoogleDocsHtml(dom);

    // Convert to markdown
    const markdown = this.turndown.turndown(dom.body?.innerHTML ?? html);

    if (!markdown || markdown.trim().length === 0) return undefined;

    const edit = new vscode.DocumentPasteEdit(
      markdown,
      'Paste as Markdown',
      PASTE_KIND
    );

    // Yield to VS Code's built-in image paste provider
    edit.yieldTo = [
      vscode.DocumentDropOrPasteEditKind.Empty.append('markdown', 'image'),
    ];

    return [edit];
  }

  private isTrivialHtml(html: string): boolean {
    // If the HTML is just a wrapper around plain text with no formatting,
    // let the default plain-text paste handle it
    const stripped = html.replace(/<\/?(?:html|head|body|meta|p|span|div)[^>]*>/gi, '').trim();
    return stripped === html.replace(/<[^>]+>/g, '').trim();
  }

  private normalizeGoogleDocsHtml(dom: Document): void {
    // Google Docs wraps everything in <b style="font-weight:normal">
    // Convert <b> with font-weight:normal to plain container
    dom.querySelectorAll('b[style]').forEach((el: Element) => {
      const style = el.getAttribute('style') ?? '';
      if (/font-weight:\s*normal/i.test(style)) {
        // Replace <b> with <span>, preserving children
        const span = dom.createElement('span');
        span.innerHTML = el.innerHTML;
        el.replaceWith(span);
      }
    });

    // Convert <span style="font-weight:bold"> or font-weight:700 to <strong>
    dom.querySelectorAll('span[style]').forEach((el: Element) => {
      const style = el.getAttribute('style') ?? '';
      if (/font-weight:\s*(bold|[7-9]00)/i.test(style)) {
        const strong = dom.createElement('strong');
        strong.innerHTML = el.innerHTML;
        el.replaceWith(strong);
      }
      if (/font-style:\s*italic/i.test(style)) {
        const em = dom.createElement('em');
        em.innerHTML = el.innerHTML;
        el.replaceWith(em);
      }
    });
  }

  private addGoogleDocsRules(): void {
    // Additional turndown rules can be added here for
    // Google Docs-specific patterns discovered during testing
  }
}

// Registration (in extension.ts activate function)
export function registerRichTextPaste(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentPasteEditProvider(
      { language: 'markdown' },
      new RichTextPasteProvider(),
      {
        providedPasteEditKinds: [PASTE_KIND],
        pasteMimeTypes: ['text/html'],
      }
    )
  );
}
```

### Scope — simplest viable implementation

**Phase 1 (MVP):**
- Register `DocumentPasteEditProvider` for `text/html` in markdown files
- Convert HTML to markdown using turndown + turndown-plugin-gfm
- Basic Google Docs normalization (bold/italic span detection, `<b>` wrapper fix)
- GFM table conversion from `<table>` elements
- Yield to built-in image paste provider
- Skip trivial HTML (plain text in wrapper tags)
- User setting: `cozyMd.paste.convertHtmlToMarkdown` (boolean, default `true`)

**Phase 2 (Polish):**
- Expanded Google Docs normalization (class-based styles, nested list fix,
  non-breaking space cleanup)
- Google Sheets table optimization
- Heading level preservation
- Code block detection from monospace fonts
- Setting for turndown options (heading style, bullet marker, etc.)

**Phase 3 (Advanced):**
- Source detection (Google Docs vs. Word vs. web) with source-specific preprocessing
- Pasted content post-processing for Cozy MD conventions (code fence frontmatter, etc.)
- Clipboard preview command: "Show what will be pasted" before committing

### Where it lives in the architecture

```
src/
├── paste/
│   ├── provider.ts           # DocumentPasteEditProvider implementation
│   ├── google-docs.ts        # Google Docs HTML normalization/preprocessing
│   └── turndown-config.ts    # Turndown instance setup, custom rules, GFM plugin
```

Register in `extension.ts` alongside the other providers.

### Configuration (package.json)

No `contributes` entry is needed for `DocumentPasteEditProvider`. It is purely
a programmatic API registration — no package.json declaration required. The
only package.json change would be adding a configuration setting:

```json
{
  "cozyMd.paste.convertHtmlToMarkdown": {
    "type": "boolean",
    "default": true,
    "description": "Convert rich text (HTML) to markdown when pasting"
  }
}
```

---

## Sources

### VS Code API
- [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api) — DocumentPasteEditProvider, DataTransfer, DocumentPasteEdit
- [Document Paste Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/document-paste) — Official sample extension (requires VS Code 1.97+)
- [VS Code 1.82 Release Notes](https://code.visualstudio.com/updates/v1_82) — DocumentPasteEditProvider finalized
- [VS Code 1.96 Release Notes](https://code.visualstudio.com/updates/v1_96) — `editor.pasteAs.preferences` setting
- [VS Code 1.79 Release Notes](https://code.visualstudio.com/updates/v1_79) — Built-in image paste for markdown
- [Paul Kuruvilla — Implementing registerDocumentPasteEditProvider](https://rohitpaulk.com/articles/copy-with-imports-2.html)
- [Issue #57577 — Add ability to paste text/html content type](https://github.com/microsoft/vscode/issues/57577)

### Libraries
- [turndown](https://github.com/mixmark-io/turndown) — HTML to Markdown converter (MIT, 7.2.2)
- [turndown on npm](https://www.npmjs.com/package/turndown) — 2.6M weekly downloads
- [turndown-plugin-gfm](https://github.com/mixmark-io/turndown-plugin-gfm) — GFM tables + strikethrough
- [@truto/turndown-plugin-gfm](https://github.com/trutohq/turndown-plugin-gfm) — Enhanced fork with 20x table performance
- [@joplin/turndown-plugin-gfm](https://www.npmjs.com/package/@joplin/turndown-plugin-gfm) — Joplin's fork with edge case fixes
- [node-html-markdown](https://github.com/crosstype/node-html-markdown) — Fast, no-DOM alternative (MIT, 113 kB)
- [rehype-remark](https://github.com/rehypejs/rehype-remark) — Unified ecosystem HTML-to-markdown
- [html-to-md](https://www.npmjs.com/package/html-to-md) — Lightweight alternative
- [turndown on Bundlephobia](https://bundlephobia.com/package/turndown)
- [node-html-markdown on Bundlephobia](https://bundlephobia.com/package/node-html-markdown)

### Google Docs HTML issues
- [Google Docs copied HTML jank (Adam Coster)](https://adamcoster.com/blog/google-docs-copied-html-jank) — Documents the `<b style="font-weight:normal">` wrapping
- [gd2md-html](https://github.com/evbacher/gd2md-html/wiki) — Google Docs to Markdown converter, documents Docs HTML quirks
- [mdconv](https://github.com/ewilderj/mdconv) — Browser extension with Google Docs normalization + turndown
- [Google Docs font-weight CSS change](https://github.com/nprapps/copydoc/issues/9) — Documents Docs switching from `bold` to `700`
- [Geoff Ruddock — Google Docs to Markdown](https://geoffruddock.com/google-docs-to-markdown-with-alfred/)

### Existing VS Code extensions
- [Paste as Markdown (digitarald)](https://marketplace.visualstudio.com/items?itemName=digitarald.paste-as-markdown)
- [Paste Markdown (R)](https://marketplace.visualstudio.com/items?itemName=R.paste-markdown)
- [Markdown Paste (telesoho)](https://marketplace.visualstudio.com/items?itemName=telesoho.vscode-markdown-paste-image)
- [Markdown All in One](https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one) — URL paste only, no HTML conversion
- [VS Code Markdown docs](https://code.visualstudio.com/docs/languages/markdown) — Built-in markdown features
