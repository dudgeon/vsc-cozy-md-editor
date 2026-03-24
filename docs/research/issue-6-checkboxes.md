# Issue #6: Google Docs Checkboxes Paste as Base64 Image Data

**Date:** 2026-03-23
**Issue:** https://github.com/dudgeon/vsc-cozy-md-editor/issues/6
**Status:** Research complete, ready for implementation
**Affects:** `src/paste/turndown-config.ts`

---

## Problem

When a user copies a checklist from Google Docs and pastes it into a markdown
file, the checkboxes appear as raw base64 image data:

```markdown
![unchecked](data:image/png;base64,iVBORw0KGgo...)
```

instead of markdown task list syntax:

```markdown
- [ ] unchecked item
- [x] checked item
```

This happens because Google Docs embeds checkboxes as inline PNG images in the
clipboard HTML, and turndown's default `<img>` rule converts them to markdown
image syntax `![alt](src)`.

---

## How Google Docs Represents Checkboxes in Clipboard HTML

Google Docs checklists are a special list type internally (the Docs API uses a
`CHECKLIST` glyph type / `CHECKBOX` bullet glyph). When copied to the clipboard,
Chrome serializes them as HTML with these characteristics:

### Structure

```html
<ul>
  <li role="checkbox" aria-checked="false">
    <img src="data:image/png;base64,..." aria-roledescription="unchecked checkbox" />
    <span>Item text here</span>
  </li>
  <li role="checkbox" aria-checked="true">
    <img src="data:image/png;base64,..." aria-roledescription="checked checkbox" />
    <span style="text-decoration:line-through">Completed item</span>
  </li>
</ul>
```

### Key attributes

| Attribute | Location | Purpose |
|---|---|---|
| `role="checkbox"` | `<li>` element | Identifies the list item as a checklist item |
| `aria-checked="true"` / `"false"` | `<li>` element | Tracks checked/unchecked state |
| `aria-roledescription` containing `"checkbox"` | `<img>` element | Identifies the image as a checkbox glyph |
| `src="data:image/png;base64,..."` | `<img>` element | The base64-encoded checkbox image |

### Detection signals (in order of reliability)

1. **`<li role="checkbox">`** -- Most reliable. The `role` attribute on the
   list item definitively identifies a checklist item. The `aria-checked`
   attribute on the same element gives checked/unchecked state.

2. **`<img aria-roledescription="...checkbox...">`** -- The inline image has
   an `aria-roledescription` attribute containing the word "checkbox". This
   is useful for removing the image element specifically.

3. **`data:image/png;base64,...` in `<img src>`** -- The image is a small
   base64-encoded PNG. This is a fallback signal but less specific (any
   base64 image would match).

### Notes on the HTML format

- This format was observed starting with Chrome Canary circa 2023-08-16
  (per comments in the `google-docs-to-markdown` project).
- The base64 image is the visual checkbox glyph -- a small square
  (unchecked) or checked square image.
- Checked items may also have `text-decoration: line-through` on the text
  span (Google Docs strikes through completed checklist items).
- The `<li>` has the authoritative checked state via `aria-checked`.
  The image's `aria-roledescription` contains "checked" or "unchecked" as
  a secondary signal but is less reliable for state detection.

---

## How Existing Tools Handle This

### Mr0grog/google-docs-to-markdown

This project (which uses rehype/remark, not turndown) has a `fixChecklists`
function in `lib/fix-google-html.js` that handles exactly this problem. It
operates on a hast (HTML AST) tree:

```javascript
const isChecklistItem = (node) =>
  node.tagName === 'li' && node.properties?.role === 'checkbox';

function fixChecklists(node) {
  visit(node, isChecklistItem, (node, _index, _parent) => {
    // Remove the b64-encoded checkbox image
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.type === 'element') {
        if (
          child.tagName === 'img' &&
          child.properties?.ariaRoleDescription?.includes('checkbox')
        ) {
          node.children.splice(i, 1);
        }
        break;
      }
    }

    // Read checked state from the <li> element
    const checked = node.properties.ariaChecked?.toLowerCase() === 'true';

    // Insert a standard <input type="checkbox"> for downstream conversion
    node.children.splice(0, 0, {
      type: 'element',
      tagName: 'p',
      children: [{
        type: 'element',
        tagName: 'input',
        properties: { type: 'checkbox', checked },
      }],
    });
  });
}
```

**Approach:** Remove the image, read `aria-checked` from the `<li>`, inject a
standard `<input type="checkbox">` that downstream markdown conversion
(remark-gfm) knows how to handle.

### evbacher/gd2md-html (Docs to Markdown add-on)

This Google Workspace add-on added checklist support in v1.0beta40 (October
2024). It uses the Google Docs API directly (not clipboard HTML), so its
approach differs -- it reads the `CHECKLIST` glyph type from the document
model. Not directly applicable to our clipboard-based paste handler.

### @truto/turndown-plugin-gfm (task list rule)

The GFM plugin already has a `taskListItems` rule that converts standard HTML
task list checkboxes to markdown:

```javascript
turndownService.addRule('taskListItems', {
  filter: function (node) {
    return node.type === 'checkbox' && node.parentNode.nodeName === 'LI'
  },
  replacement: function (content, node) {
    return (node.checked ? '[x]' : '[ ]') + ' '
  }
})
```

This rule handles `<input type="checkbox">` inside `<li>` elements. It does
NOT handle Google Docs' `<img>` representation of checkboxes. The GFM rule
would work correctly if the `<img>` were replaced with an `<input
type="checkbox">` before turndown processes the HTML.

---

## Why the Current Code Fails

Looking at `src/paste/turndown-config.ts`:

1. The `normalizeGoogleDocsHtml()` function strips the outer `<b
   id="docs-internal-guid-...">` wrapper but does not touch checkbox images
   or list item roles.

2. The `isTrivialHtml()` function checks for `<img>` in its formatting tags
   list, so the presence of checkbox images correctly prevents the HTML from
   being treated as trivial -- but then turndown's default `<img>` rule
   converts them to `![alt](data:image/png;base64,...)`.

3. The GFM plugin's `taskListItems` rule never fires because there is no
   `<input type="checkbox">` in the HTML -- only `<img>` elements.

4. Turndown receives the HTML as a raw string (not DOM nodes), so any fix
   must work at the string level or via a turndown custom rule that matches
   the relevant elements.

---

## Proposed Fix

### Approach: Custom turndown rule

Add a custom turndown rule in `turndown-config.ts` that intercepts Google Docs
checkbox images **before** the default `<img>` rule processes them. This is the
simplest fix because it works within the existing architecture (no new
dependencies, no DOM preprocessing).

Turndown rules are checked in order; the first matching rule wins. A custom
rule registered via `addRule()` takes priority over built-in rules, so it will
intercept checkbox images before the default image rule.

### Two-part fix

**Part 1: Remove checkbox images and convert to task list syntax**

```typescript
// Google Docs pastes checkboxes as <img> with aria-roledescription="...checkbox..."
// inside <li role="checkbox" aria-checked="true|false">. Convert to task list syntax.
turndownService.addRule('googleDocsCheckboxImage', {
    filter: (node: any) => {
        if (node.nodeName !== 'IMG') return false;
        const roleDesc = node.getAttribute('aria-roledescription') || '';
        return roleDesc.includes('checkbox');
    },
    replacement: (_content: string, node: any) => {
        // Read checked state from the parent <li> element
        const li = node.closest('li');
        const checked = li?.getAttribute('aria-checked') === 'true';
        return checked ? '[x] ' : '[ ] ';
    },
});
```

**Part 2: Ensure the list item renders as a task list item**

The GFM plugin's `taskListItems` rule only fires for `<input type="checkbox">`
elements. With Part 1, the `<img>` is replaced with `[x] ` or `[ ] ` text
inline. However, the `<li>` itself still renders as a normal list item via
turndown's default `<li>` rule, so the output would be:

```markdown
- [x] Item text
```

This should work because turndown's `<li>` rule prepends the list marker
(`- `) and the checkbox replacement from Part 1 provides the `[x] ` or
`[ ] ` prefix to the content.

### Important: Rule ordering

The `googleDocsCheckboxImage` rule must be registered **before** the GFM
plugin is applied (or after, since `addRule` takes priority over plugin
rules). In the current code, rules are registered after `turndownService.use(gfm)`,
which is correct -- custom rules added via `addRule()` are checked before
plugin rules and built-in rules.

### Alternative approach: HTML string preprocessing

Instead of a turndown rule, preprocess the HTML string before passing it to
turndown. This is what `normalizeGoogleDocsHtml()` already does for the
`<b>` wrapper:

```typescript
function normalizeGoogleDocsHtml(html: string): string {
    let processed = html;

    // Remove outer <b> wrapper (existing)
    processed = processed.replace(
        /<b[^>]*docs-internal-guid[^>]*>([\s\S]*)<\/b>/i,
        '$1'
    );

    // Convert checkbox images to <input type="checkbox"> (new)
    // Match <li> with role="checkbox" and replace child <img> with <input>
    processed = processed.replace(
        /<li([^>]*role="checkbox"[^>]*)>([\s\S]*?)<\/li>/gi,
        (match, liAttrs, liContent) => {
            const checked = /aria-checked="true"/i.test(liAttrs);
            // Remove the checkbox image
            const cleanContent = liContent.replace(
                /<img[^>]*aria-roledescription="[^"]*checkbox[^"]*"[^>]*\/?>/gi,
                ''
            );
            // Insert a standard checkbox input
            const input = checked
                ? '<input type="checkbox" checked />'
                : '<input type="checkbox" />';
            return `<li>${input}${cleanContent}</li>`;
        }
    );

    return processed;
}
```

**Trade-offs:**

| | Turndown rule (Part 1) | HTML preprocessing |
|---|---|---|
| Simplicity | Simpler -- one rule, ~10 lines | More complex regex on nested HTML |
| Robustness | Relies on turndown's DOM traversal | Regex on HTML is fragile |
| GFM interop | Injects text directly, skips GFM rule | Converts to `<input>` so GFM rule fires |
| Maintenance | Isolated, easy to test | Coupled with existing preprocessing |

### Recommendation

**Use the turndown rule approach (Part 1).** It is simpler, more robust
(operates on parsed DOM nodes rather than regex over HTML strings), and
isolated from the existing preprocessing logic. If turndown's DOM handling
of `node.closest('li')` does not work reliably with string-input mode,
fall back to the HTML preprocessing approach.

### Fallback detection: base64 image heuristic

If a Google Docs update changes the ARIA attributes (unlikely but possible),
add a fallback rule that catches any small base64 image inside a list item:

```typescript
turndownService.addRule('checkboxImageFallback', {
    filter: (node: any) => {
        if (node.nodeName !== 'IMG') return false;
        const src = node.getAttribute('src') || '';
        // Small base64 PNG inside an <li> is likely a checkbox glyph
        return src.startsWith('data:image/png;base64,')
            && src.length < 2000  // checkbox images are small (~500-1000 chars)
            && node.closest('li');
    },
    replacement: () => '[ ] ',
});
```

This is a safety net, not the primary detection. It would produce unchecked
checkboxes for any small inline image in a list, which is acceptable as a
degradation.

---

## Testing Plan

### Unit test: turndown rule

Add a test in `src/test/suite/parsers/` (or a new `src/test/suite/paste/`
directory) that passes Google Docs-style checkbox HTML through
`convertHtmlToMarkdown()` and asserts the output:

```typescript
suite('Google Docs checkbox paste', () => {
    test('unchecked checkbox converts to - [ ]', () => {
        const html = `
            <ul>
                <li role="checkbox" aria-checked="false">
                    <img src="data:image/png;base64,ABC123" aria-roledescription="unchecked checkbox" />
                    <span>Buy groceries</span>
                </li>
            </ul>`;
        const result = convertHtmlToMarkdown(html);
        assert.ok(result);
        assert.match(result!, /- \[ \] Buy groceries/);
        assert.ok(!result!.includes('data:image'));
    });

    test('checked checkbox converts to - [x]', () => {
        const html = `
            <ul>
                <li role="checkbox" aria-checked="true">
                    <img src="data:image/png;base64,XYZ789" aria-roledescription="checked checkbox" />
                    <span style="text-decoration:line-through">Buy groceries</span>
                </li>
            </ul>`;
        const result = convertHtmlToMarkdown(html);
        assert.ok(result);
        assert.match(result!, /- \[x\] Buy groceries/);
    });

    test('mixed checklist with checked and unchecked items', () => {
        const html = `
            <ul>
                <li role="checkbox" aria-checked="true">
                    <img src="data:image/png;base64,AAA" aria-roledescription="checked checkbox" />
                    <span>Done item</span>
                </li>
                <li role="checkbox" aria-checked="false">
                    <img src="data:image/png;base64,BBB" aria-roledescription="unchecked checkbox" />
                    <span>Pending item</span>
                </li>
            </ul>`;
        const result = convertHtmlToMarkdown(html);
        assert.ok(result);
        assert.match(result!, /- \[x\] Done item/);
        assert.match(result!, /- \[ \] Pending item/);
    });

    test('no base64 image data in output', () => {
        const html = `
            <ul>
                <li role="checkbox" aria-checked="false">
                    <img src="data:image/png;base64,${
                        'A'.repeat(500)
                    }" aria-roledescription="unchecked checkbox" />
                    <span>Item</span>
                </li>
            </ul>`;
        const result = convertHtmlToMarkdown(html);
        assert.ok(result);
        assert.ok(!result!.includes('base64'));
        assert.ok(!result!.includes('data:image'));
    });
});
```

### Manual F5 test

1. Create a Google Doc with a checklist (Format > Bullets & numbering >
   Checklist)
2. Add items, check some of them
3. Copy the checklist
4. Paste into a markdown file in the Extension Development Host
5. Verify output is `- [ ]` / `- [x]` with no base64 artifacts

### Edge cases to test

- Checklist with strikethrough on checked items (Google Docs default)
- Nested checklists (indented checklist items)
- Mixed content: checklist interleaved with regular list items
- Checklist pasted alongside other formatted content (headings, paragraphs)
- Empty checklist item (checkbox with no text)

---

## Scope of Changes

| File | Change |
|---|---|
| `src/paste/turndown-config.ts` | Add `googleDocsCheckboxImage` turndown rule |
| `src/test/suite/paste/checkbox.test.ts` (new) | Unit tests for checkbox conversion |

No new dependencies required. No changes to `package.json`.

---

## Open Questions

1. **`node.closest('li')` in string-input mode** -- Turndown internally
   parses the HTML string into a DOM tree (using the browser's DOMParser in
   browser environments, or an internal parser in Node). Need to verify that
   `node.closest('li')` works correctly in turndown's Node.js DOM
   environment. If not, use the `node.parentNode` chain or fall back to the
   HTML preprocessing approach.

2. **Strikethrough on checked items** -- Google Docs applies
   `text-decoration: line-through` to checked checklist items. Should this
   be stripped (since the `[x]` already indicates completion) or preserved
   as `~~text~~`? Recommendation: strip it, since `~~strikethrough~~` on a
   task list item would be confusing.

3. **Unicode checkbox characters** -- Google Docs also supports inserting
   checkbox characters via Insert > Special Characters (Unicode glyphs like
   U+2610 BALLOT BOX and U+2611 BALLOT BOX WITH CHECK). These are not
   checklist items -- they are plain text characters. Should the paste
   handler convert these too? Recommendation: defer to a separate issue, as
   these are plain text and the conversion semantics are ambiguous.

4. **Non-Google sources** -- Other applications may also paste checkboxes as
   images (e.g., Notion, Confluence). The turndown rule should be general
   enough to catch these, but testing is needed. The
   `aria-roledescription` filter is specific to Google Docs; other sources
   may use different attributes.

---

## Sources

### Prior art (Google Docs to Markdown converters)
- [Mr0grog/google-docs-to-markdown](https://github.com/Mr0grog/google-docs-to-markdown) -- `fixChecklists()` in `lib/fix-google-html.js` handles exactly this problem
- [evbacher/gd2md-html](https://github.com/evbacher/gd2md-html) -- Docs to Markdown add-on, checkbox support added in v1.0beta40

### Turndown
- [turndown](https://github.com/mixmark-io/turndown) -- HTML to Markdown converter
- [@truto/turndown-plugin-gfm](https://github.com/trutohq/turndown-plugin-gfm) -- GFM plugin with `taskListItems` rule

### Google Docs
- [Google Docs Editors Help: Add & use checkboxes](https://support.google.com/docs/answer/7684717)
- [Google Docs API: ListProperties](https://developers.google.com/resources/api-libraries/documentation/docs/v1/java/latest/com/google/api/services/docs/v1/model/ListProperties.html) -- CHECKLIST glyph type in the document model
- [Google Docs Editors Community: Copying checkboxes](https://support.google.com/docs/thread/173468835) -- User reports of checkbox copy/paste issues

### Accessibility attributes
- [MDN: aria-roledescription](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-roledescription)
- [MDN: ARIA checkbox role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/checkbox_role)
