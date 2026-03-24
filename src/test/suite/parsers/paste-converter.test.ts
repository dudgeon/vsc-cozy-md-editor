import * as assert from 'assert';
import { convertHtmlToMarkdown } from '../../../paste/turndown-config';

suite('Paste Converter', () => {

    // --- Basic conversion ---

    suite('Basic conversion', () => {
        test('should convert <b> to bold', () => {
            assert.strictEqual(convertHtmlToMarkdown('<b>bold</b>'), '**bold**');
        });

        test('should convert <strong> to bold', () => {
            assert.strictEqual(convertHtmlToMarkdown('<strong>bold</strong>'), '**bold**');
        });

        test('should convert <i> to italic', () => {
            assert.strictEqual(convertHtmlToMarkdown('<i>italic</i>'), '*italic*');
        });

        test('should convert <em> to italic', () => {
            assert.strictEqual(convertHtmlToMarkdown('<em>italic</em>'), '*italic*');
        });

        test('should convert <a> to markdown link', () => {
            const result = convertHtmlToMarkdown('<a href="https://example.com">link text</a>');
            assert.strictEqual(result, '[link text](https://example.com)');
        });

        test('should convert <h1> to heading', () => {
            assert.strictEqual(convertHtmlToMarkdown('<h1>Heading</h1>'), '# Heading');
        });

        test('should convert <h2> to heading', () => {
            assert.strictEqual(convertHtmlToMarkdown('<h2>Heading</h2>'), '## Heading');
        });

        test('should convert <h3> to heading', () => {
            assert.strictEqual(convertHtmlToMarkdown('<h3>Heading</h3>'), '### Heading');
        });

        test('should convert unordered list without extra blank lines', () => {
            const result = convertHtmlToMarkdown('<ul><li>item 1</li><li>item 2</li></ul>');
            assert.ok(result, 'should not be null');
            assert.strictEqual(result, '- item 1\n- item 2');
        });

        test('should convert ordered list without extra blank lines', () => {
            const result = convertHtmlToMarkdown('<ol><li>first</li><li>second</li></ol>');
            assert.ok(result, 'should not be null');
            assert.strictEqual(result, '1. first\n2. second');
        });

        test('should convert inline <code> to backticks', () => {
            assert.strictEqual(convertHtmlToMarkdown('<code>code</code>'), '`code`');
        });

        test('should convert <pre><code> to fenced code block', () => {
            const result = convertHtmlToMarkdown('<pre><code>code block</code></pre>');
            assert.ok(result, 'should not be null');
            assert.ok(result!.includes('```'), 'should contain triple backticks');
            assert.ok(result!.includes('code block'), 'should contain code content');
        });

        test('should convert blockquote', () => {
            const result = convertHtmlToMarkdown('<blockquote><p>quoted</p></blockquote>');
            assert.ok(result, 'should not be null');
            assert.ok(result!.includes('> quoted') || result!.includes('>quoted'), 'should contain blockquote marker');
        });
    });

    // --- Table conversion ---

    suite('Table conversion', () => {
        test('should convert HTML table to markdown pipe table', () => {
            const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
            const result = convertHtmlToMarkdown(html);
            assert.ok(result, 'should not be null');
            assert.ok(result!.includes('| A'), 'should contain header A');
            assert.ok(result!.includes('| B') || result!.includes('B |'), 'should contain header B');
            assert.ok(result!.includes('| 1'), 'should contain cell 1');
            assert.ok(result!.includes('| 2') || result!.includes('2 |'), 'should contain cell 2');
            assert.ok(result!.includes('---'), 'should contain separator row');
        });
    });

    // --- Google Docs HTML ---

    suite('Google Docs HTML', () => {
        test('should convert font-weight:700 span to bold', () => {
            const result = convertHtmlToMarkdown('<span style="font-weight:700">bold</span>');
            assert.strictEqual(result, '**bold**');
        });

        test('should convert font-style:italic span to italic', () => {
            const result = convertHtmlToMarkdown('<span style="font-style:italic">italic</span>');
            assert.strictEqual(result, '*italic*');
        });

        test('should handle docs-internal-guid wrapper', () => {
            const html = '<span id="docs-internal-guid-abc123"><span style="font-weight:700">bold</span> text</span>';
            const result = convertHtmlToMarkdown(html);
            assert.ok(result, 'should not be null');
            assert.ok(result!.includes('**bold**'), 'should convert bold inside guid wrapper');
        });
    });

    // --- Google Docs checkboxes (Issue #6) ---

    suite('Google Docs checkboxes (Issue #6)', () => {
        test('unchecked checkbox image converts to [ ]', () => {
            const html = '<ul><li role="checkbox" aria-checked="false"><img src="data:image/png;base64,ABC123" aria-roledescription="unchecked checkbox" /><span>Buy groceries</span></li></ul>';
            const result = convertHtmlToMarkdown(html);
            assert.ok(result, 'should not be null');
            assert.match(result!, /\[ \] Buy groceries/);
            assert.ok(!result!.includes('data:image'), 'should not contain base64 image data');
        });

        test('checked checkbox image converts to [x]', () => {
            const html = '<ul><li role="checkbox" aria-checked="true"><img src="data:image/png;base64,XYZ789" aria-roledescription="checked checkbox" /><span>Done task</span></li></ul>';
            const result = convertHtmlToMarkdown(html);
            assert.ok(result, 'should not be null');
            assert.match(result!, /\[x\] Done task/);
            assert.ok(!result!.includes('data:image'), 'should not contain base64 image data');
        });

        test('mixed checklist with checked and unchecked items', () => {
            const html = '<ul><li role="checkbox" aria-checked="true"><img src="data:image/png;base64,AAA" aria-roledescription="checked checkbox" /><span>Done item</span></li><li role="checkbox" aria-checked="false"><img src="data:image/png;base64,BBB" aria-roledescription="unchecked checkbox" /><span>Pending item</span></li></ul>';
            const result = convertHtmlToMarkdown(html);
            assert.ok(result, 'should not be null');
            assert.match(result!, /\[x\] Done item/);
            assert.match(result!, /\[ \] Pending item/);
        });

        test('checkbox list item renders with list marker prefix', () => {
            const html = '<ul><li role="checkbox" aria-checked="false"><img src="data:image/png;base64,ABC" aria-roledescription="unchecked checkbox" /><span>Task text</span></li></ul>';
            const result = convertHtmlToMarkdown(html);
            assert.ok(result, 'should not be null');
            assert.match(result!, /^- \[ \] Task text/, 'should have list marker prefix');
        });

        test('no base64 data in output even with large image payload', () => {
            const html = `<ul><li role="checkbox" aria-checked="false"><img src="data:image/png;base64,${'A'.repeat(500)}" aria-roledescription="unchecked checkbox" /><span>Item</span></li></ul>`;
            const result = convertHtmlToMarkdown(html);
            assert.ok(result, 'should not be null');
            assert.ok(!result!.includes('base64'), 'should not contain base64');
            assert.ok(!result!.includes('data:image'), 'should not contain data URI');
        });
    });

    // --- Trivial HTML (returns null) ---

    suite('Trivial HTML returns null', () => {
        test('should return null for plain paragraph', () => {
            assert.strictEqual(convertHtmlToMarkdown('<p>plain text</p>'), null);
        });

        test('should return null for plain div', () => {
            assert.strictEqual(convertHtmlToMarkdown('<div>plain text</div>'), null);
        });

        test('should return null for empty string', () => {
            assert.strictEqual(convertHtmlToMarkdown(''), null);
        });

        test('should return null for whitespace-only string', () => {
            assert.strictEqual(convertHtmlToMarkdown('   '), null);
        });
    });

    // --- Non-trivial HTML (returns markdown) ---

    suite('Non-trivial HTML returns markdown', () => {
        test('should return markdown for paragraph with bold', () => {
            const result = convertHtmlToMarkdown('<p><b>bold</b> text</p>');
            assert.ok(result !== null, 'should not be null');
            assert.ok(result!.includes('**bold**'), 'should contain bold markdown');
        });

        test('should return markdown for paragraph with link', () => {
            const result = convertHtmlToMarkdown('<p>text with <a href="url">link</a></p>');
            assert.ok(result !== null, 'should not be null');
            assert.ok(result!.includes('[link](url)'), 'should contain markdown link');
        });
    });

    // --- List spacing (Issue #7) ---

    suite('List spacing (Issue #7)', () => {
        test('should produce tight list when <li> contains <p> (Google Docs style)', () => {
            const html = '<ul><li><p>Item 1</p></li><li><p>Item 2</p></li><li><p>Item 3</p></li></ul>';
            const result = convertHtmlToMarkdown(html);
            assert.strictEqual(result, '- Item 1\n- Item 2\n- Item 3');
        });

        test('should produce tight ordered list when <li> contains <p>', () => {
            const html = '<ol><li><p>First</p></li><li><p>Second</p></li><li><p>Third</p></li></ol>';
            const result = convertHtmlToMarkdown(html);
            assert.strictEqual(result, '1. First\n2. Second\n3. Third');
        });

        test('should handle Google Docs list with spans inside <p> inside <li>', () => {
            const html = '<ul><li dir="ltr"><p dir="ltr"><span>Item 1</span></p></li><li dir="ltr"><p dir="ltr"><span>Item 2</span></p></li></ul>';
            const result = convertHtmlToMarkdown(html);
            assert.strictEqual(result, '- Item 1\n- Item 2');
        });

        test('should handle nested list without extra blank lines', () => {
            const html = '<ul><li>Parent<ul><li>Child 1</li><li>Child 2</li></ul></li><li>Sibling</li></ul>';
            const result = convertHtmlToMarkdown(html);
            assert.ok(result, 'should not be null');
            // Should not have double blank lines anywhere
            assert.ok(!result!.includes('\n\n\n'), 'should not have triple newlines');
            assert.ok(result!.includes('Parent'), 'should contain parent');
            assert.ok(result!.includes('Child 1'), 'should contain child 1');
            assert.ok(result!.includes('Sibling'), 'should contain sibling');
        });
    });

    // --- Edge cases ---

    suite('Edge cases', () => {
        test('should handle nested bold and italic', () => {
            const result = convertHtmlToMarkdown('<b><i>bold italic</i></b>');
            assert.ok(result, 'should not be null');
            // Could be ***bold italic***, **_bold italic_**, or similar
            assert.ok(result!.includes('bold italic'), 'should contain text');
            assert.ok(
                result!.includes('***') || result!.includes('**_') || result!.includes('***'),
                'should have combined bold+italic markers'
            );
        });

        test('should handle link with bold text', () => {
            const result = convertHtmlToMarkdown('<a href="url"><b>bold link</b></a>');
            assert.ok(result, 'should not be null');
            assert.ok(result!.includes('bold link'), 'should contain link text');
            assert.ok(result!.includes('url'), 'should contain URL');
        });

        test('should handle multiple paragraphs', () => {
            const result = convertHtmlToMarkdown('<p>First</p><p>Second</p>');
            // Two plain paragraphs might be trivial or non-trivial depending on implementation.
            // If returned, they should be separated.
            if (result !== null) {
                assert.ok(result.includes('First'), 'should contain first paragraph');
                assert.ok(result.includes('Second'), 'should contain second paragraph');
            }
        });
    });
});
