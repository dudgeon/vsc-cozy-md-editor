import * as assert from 'assert';
import { parseTable, serializeTable } from '../../../parsers/markdown-table';

suite('Markdown Table Parser', () => {
    test('should parse a simple table', () => {
        const text = '| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |';
        const result = parseTable(text, 0);
        assert.ok(result);
        assert.strictEqual(result.headers.length, 2);
        assert.strictEqual(result.rows.length, 1);
    });

    test('should handle alignment markers', () => {
        const text = '| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |';
        const result = parseTable(text, 0);
        assert.ok(result);
        assert.strictEqual(result.headers[0].alignment, 'left');
        assert.strictEqual(result.headers[1].alignment, 'center');
        assert.strictEqual(result.headers[2].alignment, 'right');
    });

    test('should serialize with aligned columns', () => {
        // TODO: Test that serialization pads columns for visual alignment
    });

    test('should return null for non-table text', () => {
        const result = parseTable('Not a table', 0);
        assert.strictEqual(result, null);
    });
});
