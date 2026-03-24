# Issue #7: Pasted Nested Lists Lose Structure + Extra Line Breaks

**Date:** 2026-03-23
**Status:** Research complete, fix proposed
**Related:** `src/paste/turndown-config.ts`, turndown 7.2.2

---

## Problem Summary

When pasting nested lists from rich text sources (Google Docs, Gmail, web pages)
into a markdown file, two distinct problems occur:

1. **Nested lists lose indentation** -- sub-items appear at the same level as
   parent items instead of being indented.
2. **Extra blank lines between list items** -- each list item is separated by a
   blank line, producing a "loose list" that looks wrong.

Both problems originate in turndown's built-in list conversion rules interacting
with the HTML structure of pasted content. They are separate bugs with separate
root causes.

---

## Root Cause Analysis

### Problem 1: Nested lists lose indentation

**Two sub-causes, depending on the HTML source:**

#### 1a. Google Docs uses flat lists with CSS indentation (not nested HTML)

Google Docs does not always emit properly nested `<ul>` / `<ol>` HTML when the
user copies a nested list. Instead, it often produces a **flat list** where all
items are siblings at the same level, using `margin-left` or `padding-left`
CSS to visually indent sub-items:

```html
<!-- What Google Docs often puts on the clipboard -->
<ul>
  <li style="margin-left:0"><span>Item 1</span></li>
  <li style="margin-left:36pt"><span>Sub-item 1a</span></li>
  <li style="margin-left:36pt"><span>Sub-item 1b</span></li>
  <li style="margin-left:0"><span>Item 2</span></li>
</ul>
```

Turndown sees four sibling `<li>` elements inside one `<ul>` and converts them
all as top-level list items. The `margin-left` style is ignored because turndown
only looks at DOM nesting structure, not CSS properties:

```markdown
- Item 1
- Sub-item 1a
- Sub-item 1b
- Item 2
```

**Expected output:**
```markdown
- Item 1
    - Sub-item 1a
    - Sub-item 1b
- Item 2
```

This is a **Google Docs-specific** issue. Other sources (Confluence, web pages)
typically use properly nested HTML.

#### 1b. Turndown's indentation width may not match the markdown parser

Even when HTML is properly nested (`<ul>` inside `<li>`), turndown's `listItem`
rule produces indentation that may not render correctly in all markdown parsers.

The current turndown 7.2.2 `listItem` rule uses this prefix:
```javascript
var prefix = options.bulletListMarker + '   ';  // marker + 3 spaces = 4 chars
// For ordered: prefix = '1.  ';                // number + dot + 2 spaces
```

The subsequent lines of nested content are indented by `prefix.length` spaces
(4 for unordered, 4 for single-digit ordered). This is **correct** for
CommonMark and most markdown parsers, which require content to align with the
first character after the list marker.

However, there is a known issue (#484 in the turndown repo) requesting a
configurable indentation width. Some markdown environments (notably VS Code's
built-in markdown preview) render nested lists with 2-space indentation, while
turndown produces 4-space indentation. This mismatch can cause nested lists to
appear at the wrong level in some renderers, though the output is technically
valid markdown.

**Verdict:** Sub-cause 1a (Google Docs flat lists) is the primary driver of
structure loss for Cozy MD Editor's target users. Sub-cause 1b is a minor
compatibility concern.

---

### Problem 2: Extra blank lines between list items

This is caused by `<p>` tags inside `<li>` elements. Many rich text sources --
especially Google Docs -- wrap every list item's text content in a `<p>`:

```html
<!-- Google Docs typical clipboard HTML -->
<ul>
  <li dir="ltr">
    <p dir="ltr"><span>Item 1</span></p>
  </li>
  <li dir="ltr">
    <p dir="ltr"><span>Item 2</span></p>
  </li>
  <li dir="ltr">
    <p dir="ltr"><span>Item 3</span></p>
  </li>
</ul>
```

Here is how turndown processes this, step by step:

1. **The `paragraph` rule** converts each `<p>` to `\n\nContent\n\n` (it wraps
   content with double newlines on both sides).

2. **The `listItem` rule** receives this `\n\nContent\n\n` as the `content`
   parameter for each `<li>`.

3. The `listItem` rule checks `var isParagraph = /\n$/.test(content)` -- this
   is `true`, so it preserves a trailing newline.

4. `trimNewlines(content)` strips the leading/trailing newlines, giving
   `Content`.

5. But then `(isParagraph ? '\n' : '')` appends a trailing `\n`.

6. The final return is `prefix + content + (node.nextSibling ? '\n' : '')`,
   which for a mid-list item becomes: `- Content\n\n`

7. The `list` rule wraps the concatenated items with `\n\n...\n\n`.

The net result is double blank lines between list items:

```markdown
- Item 1

- Item 2

- Item 3
```

This is technically a valid "loose list" in CommonMark (paragraphs inside list
items = loose list), but it is not what users expect when they paste a simple
bulleted list. In CommonMark, a loose list renders each item wrapped in `<p>`
tags, adding visual spacing. This is almost never the user's intent when pasting
from Google Docs.

**The core mechanism:** Turndown's `paragraph` rule generates `\n\n` boundaries
unconditionally. When a `<p>` is the only child of a `<li>`, the double newlines
are unnecessary overhead that propagates into the list item output as blank-line
separators.

---

## Does the GFM Plugin Affect List Handling?

**No.** The `@truto/turndown-plugin-gfm` plugin (v1.0.6, installed in this
project) adds four features:

1. `tables` -- HTML `<table>` to markdown pipe tables
2. `strikethrough` -- `<del>`/`<s>` to `~~text~~`
3. `taskListItems` -- `<input type="checkbox">` in `<li>` to `- [x]`/`- [ ]`
4. `highlightedCodeBlock` -- `<pre>` with language class

None of these override or modify the core `list` or `listItem` rules. The
`taskListItems` rule only handles checkbox detection within list items; it does
not change indentation or newline behavior. The GFM plugin is not a factor in
either problem.

---

## Prior Art: How Others Have Fixed This

### Obsidian

Obsidian uses turndown internally and had the same double-newline problem.
Multiple community threads document users seeing `\n\n` between pasted list
items. The `obsidian-advanced-paste` plugin (by kxxt, now archived) addressed
this by post-processing the turndown output to collapse extra blank lines.
Obsidian itself eventually patched their internal turndown fork.

Relevant threads:
- [Pasting formatted text gives double line breaks](https://forum.obsidian.md/t/pasting-formatted-text-gives-double-line-breaks-double-new-line/71186)
- [Fixed issue with double line breaks between list items](https://forum.obsidian.md/t/fixed-issue-with-pasting-formatted-text-gives-double-line-breaks-between-list-items/99774)

### Joplin (paste-as-markdown plugin)

The [paste-as-markdown](https://github.com/bwat47/paste-as-markdown) Joplin
plugin includes **list normalization** that re-nests orphaned lists before
passing HTML to turndown. This is a DOM preprocessing step that detects flat
lists with indentation hints and rebuilds them as properly nested `<ul>`/`<ol>`
trees. This addresses problem 1a (Google Docs flat lists) at the HTML level.

### Joplin (@joplin/turndown fork)

Joplin maintains a [fork of turndown](https://github.com/laurent22/joplin-turndown)
with several list-related fixes:
- Fixed ordered list indentation for lists with >9 items
- Improved handling of nested list structures

### CKEditor 5

CKEditor's [paste-from-google-docs](https://ckeditor.com/docs/ckeditor5/latest/features/pasting/paste-from-google-docs.html)
plugin auto-detects Google Docs content and transforms its structure to clean
semantic HTML before processing. This is the most robust approach -- fix the
HTML before conversion.

---

## Relevant Turndown GitHub Issues

| Issue | Title | Status | Relevance |
|-------|-------|--------|-----------|
| [#125](https://github.com/mixmark-io/turndown/issues/125) | Cannot handle nested list correctly | Closed | Early report of nesting bugs |
| [#232](https://github.com/mixmark-io/turndown/issues/232) | Support sub-lists and sub-sub-lists | Closed | Flat-to-nested conversion request |
| [#291](https://github.com/mixmark-io/turndown/issues/291) | Add option to control length of bullet indentation | Open | Indentation width config |
| [#357](https://github.com/mixmark-io/turndown/issues/357) | Issues with list items | Closed | Headers inside list items |
| [#410](https://github.com/mixmark-io/turndown/issues/410) | Lists over 9 items long break with indented content | Open | Ordered list indent bug |
| [#484](https://github.com/mixmark-io/turndown/issues/484) | Feature: Option for list item indentation | Open | Configurable indent width |

---

## Proposed Fix

The fix requires two custom turndown rules added to `src/paste/turndown-config.ts`
plus an HTML preprocessing step. All three changes are independent and can be
implemented/tested separately.

### Fix A: Override `listItem` rule to suppress loose-list newlines (Problem 2)

Override turndown's built-in `listItem` rule with a custom version that detects
single-`<p>`-inside-`<li>` and treats it as a tight list item.

```typescript
// Fix extra blank lines: override listItem to collapse <p>-in-<li> to tight items
turndownService.addRule('tightListItem', {
    filter: 'li',
    replacement: function (content: string, node: any, options: any) {
        // Determine the prefix (bullet or number)
        let prefix = options.bulletListMarker + '   ';
        const parent = node.parentNode;
        if (parent && parent.nodeName === 'OL') {
            const start = parent.getAttribute('start');
            const index = Array.prototype.indexOf.call(parent.children, node);
            prefix = (start ? Number(start) + index : index + 1) + '.  ';
        }

        // Key fix: if the <li> contains exactly one <p> (and possibly a nested
        // list), the double-newlines from the paragraph rule are spurious.
        // Strip them to produce a tight list item.
        content = content
            .replace(/^\n+/, '')   // strip leading newlines
            .replace(/\n+$/, '');  // strip trailing newlines

        // Re-indent nested content to align with the prefix
        content = content.replace(/\n/gm, '\n' + ' '.repeat(prefix.length));

        return prefix + content + (node.nextSibling ? '\n' : '');
    },
});
```

**How it differs from the built-in rule:** The built-in rule preserves a
trailing `\n` when `isParagraph` is true (line 152-153 in turndown source).
This override unconditionally strips all leading/trailing newlines, collapsing
loose list items to tight. This is the correct behavior for pasted content --
users pasting a bulleted list from Google Docs never intend to create a loose
list.

**Trade-off:** This produces tight lists even when the source HTML genuinely
intended a loose list (e.g., a Confluence page with multi-paragraph list items).
For Cozy MD Editor's target users (PMs pasting from Google Docs), tight lists
are always the right default. If multi-paragraph list items become a need later,
a heuristic can be added: only collapse when each `<li>` contains exactly one
`<p>` and no other block-level children.

### Fix B: HTML preprocessing to re-nest flat Google Docs lists (Problem 1a)

Add a DOM preprocessing step in `normalizeGoogleDocsHtml()` (or a new function)
that detects flat lists with `margin-left` indentation and restructures them
into properly nested `<ul>`/`<ol>` trees.

```typescript
/**
 * Re-nest flat Google Docs lists that use margin-left for indentation
 * instead of nested <ul>/<ol> elements.
 *
 * Google Docs sometimes emits:
 *   <ul>
 *     <li style="margin-left:0">Item 1</li>
 *     <li style="margin-left:36pt">Sub-item</li>
 *   </ul>
 *
 * This function restructures it to:
 *   <ul>
 *     <li>Item 1
 *       <ul><li>Sub-item</li></ul>
 *     </li>
 *   </ul>
 */
function renestFlatLists(html: string): string {
    // Implementation approach:
    // 1. Parse the HTML (turndown already has a DOM via @mixmark-io/domino)
    // 2. For each <ul>/<ol>, check if any <li> children have margin-left
    // 3. Group consecutive <li> elements by their margin-left value
    // 4. For each group with margin > the previous group, wrap in a new
    //    <ul>/<ol> and append to the previous group's last <li>
    // 5. Serialize back to HTML string
    //
    // The margin-left values observed in Google Docs:
    //   Level 0: 0 or omitted
    //   Level 1: 36pt
    //   Level 2: 72pt
    //   Each level adds ~36pt
    //
    // Edge case: mixed margin units (pt, px, em). Normalize to pt.
    // Edge case: ordered list inside unordered or vice versa -- preserve
    //   the list type from the <li>'s list-style-type style.
}
```

**Note on implementation:** Since turndown 7.2.2 uses `@mixmark-io/domino` as
its internal DOM parser (for Node.js environments), the preprocessing can
operate on the same DOM. However, the current `convertHtmlToMarkdown()` function
passes HTML as a string to turndown (line 101 of `turndown-config.ts`), so the
preprocessing would need to either:

a. Operate on the HTML string with regex (fragile but simple), or
b. Parse the HTML to DOM, preprocess, serialize back to string, then pass to
   turndown (robust but slightly more code)

**Recommendation:** Option (b). Parse with `@mixmark-io/domino` (already a
transitive dependency via turndown), preprocess the DOM, serialize with
`dom.documentElement.outerHTML`, then pass to turndown. This avoids fragile
regex manipulation of HTML.

### Fix C: Post-processing cleanup of turndown output (belt-and-suspenders)

As a safety net, add a post-processing step on the markdown string returned by
turndown to collapse consecutive blank lines within lists:

```typescript
function cleanupListSpacing(markdown: string): string {
    // Collapse 2+ blank lines between list items to a single newline.
    // A list item line starts with `-`, `*`, `+`, or `\d+\.` after
    // optional leading whitespace.
    return markdown.replace(
        /^([ \t]*[-*+]|\d+\.)(.+)\n\n+(?=[ \t]*[-*+]|\d+\.)/gm,
        '$1$2\n'
    );
}
```

This is simpler than Fix A but less precise -- it operates on the final string
rather than during conversion, so it could theoretically collapse intentional
blank lines. For Cozy MD Editor's use case (paste conversion), this is
acceptable.

---

## Recommended Implementation Order

1. **Fix A first** (override `listItem` rule) -- addresses Problem 2 for all
   HTML sources with minimal code. Can be validated immediately with unit tests.

2. **Fix C second** (post-processing cleanup) -- belt-and-suspenders for any
   edge cases Fix A misses. Also minimal code.

3. **Fix B last** (DOM preprocessing for flat lists) -- addresses Problem 1a
   specifically for Google Docs. More complex, needs real Google Docs clipboard
   HTML to test against. Should be part of the Google Docs preprocessing work
   already planned in the paste spec (Phase 3).

### What to test

- Properly nested `<ul>` with sub-`<ul>` inside `<li>` -- should produce
  indented sub-items (already works in turndown, verify no regression)
- `<li>` containing `<p>` -- should produce tight list, not loose
- Google Docs flat list with `margin-left` -- should produce nested markdown
  (after Fix B)
- Mixed ordered/unordered nesting
- Three levels of nesting
- Task lists with nesting (checkbox + indentation)
- Lists with >9 items (ordered list indentation width)

---

## Sources

### Turndown source code (installed: v7.2.2)
- `node_modules/turndown/lib/turndown.cjs.js` lines 86-159 -- `paragraph`,
  `list`, and `listItem` rules that produce the observed behavior

### Turndown GitHub issues
- [#125: Cannot handle nested list correctly](https://github.com/mixmark-io/turndown/issues/125)
- [#232: Support sub-lists and sub-sub-lists](https://github.com/mixmark-io/turndown/issues/232)
- [#291: Add option to control length of bullet indentation](https://github.com/mixmark-io/turndown/issues/291)
- [#357: Issues with list items](https://github.com/mixmark-io/turndown/issues/357)
- [#410: Lists over 9 items long break with indented content](https://github.com/mixmark-io/turndown/issues/410)
- [#484: Feature: Option for list item indentation](https://github.com/mixmark-io/turndown/issues/484)

### Prior art
- [Joplin paste-as-markdown plugin](https://github.com/bwat47/paste-as-markdown) -- list normalization for re-nesting orphaned lists
- [Joplin turndown fork](https://github.com/laurent22/joplin-turndown) -- list indentation fixes
- [CKEditor paste from Google Docs](https://ckeditor.com/docs/ckeditor5/latest/features/pasting/paste-from-google-docs.html) -- DOM preprocessing approach
- [Obsidian: double line breaks on paste](https://forum.obsidian.md/t/pasting-formatted-text-gives-double-line-breaks-double-new-line/71186)
- [Obsidian: fixed double line breaks](https://forum.obsidian.md/t/fixed-issue-with-pasting-formatted-text-gives-double-line-breaks-between-list-items/99774)

### Google Docs HTML quirks
- [Adam Coster: Google Docs copied HTML jank](https://adamcoster.com/blog/google-docs-copied-html-jank)
- [gd2md-html wiki](https://github.com/evbacher/gd2md-html/wiki) -- documents Docs HTML quirks
- [CKEditor: Paste from Google Docs](https://ckeditor.com/docs/ckeditor4/latest/examples/pastefromgoogledocs.html) -- documents Docs list structure issues
