import * as assert from 'assert';
import { parseFrontmatter, serializeFrontmatter } from '../../../parsers/frontmatter';

suite('Frontmatter Parser', () => {
    test('should parse code fence delimited frontmatter', () => {
        const text = '```\ntitle: Test\ndate: 2026-01-01\n```\n\n# Content';
        const result = parseFrontmatter(text);
        assert.ok(result);
        assert.strictEqual(result.delimiter, 'codefence');
        assert.strictEqual(result.data.title, 'Test');
    });

    test('should parse triple-dash delimited frontmatter (legacy)', () => {
        const text = '---\ntitle: Test\ndate: 2026-01-01\n---\n\n# Content';
        const result = parseFrontmatter(text);
        assert.ok(result);
        assert.strictEqual(result.delimiter, 'dashes');
        assert.strictEqual(result.data.title, 'Test');
    });

    test('should always serialize with code fence delimiters', () => {
        const result = serializeFrontmatter({ title: 'Test', date: '2026-01-01' });
        assert.ok(result.startsWith('```\n'));
        assert.ok(result.endsWith('\n```'));
        assert.ok(!result.includes('---'));
    });

    test('should return null for files without frontmatter', () => {
        const result = parseFrontmatter('# Just a heading\n\nSome content');
        assert.strictEqual(result, null);
    });
});
