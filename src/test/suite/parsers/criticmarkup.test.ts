import * as assert from 'assert';
import { parseCriticMarkup } from '../../../parsers/criticmarkup';

suite('CriticMarkup Parser', () => {
    test('should parse additions', () => {
        const result = parseCriticMarkup('Hello {++ world ++}');
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].type, 'addition');
        assert.strictEqual(result[0].content, ' world ');
    });

    test('should parse deletions', () => {
        const result = parseCriticMarkup('Hello {-- world --}');
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].type, 'deletion');
        assert.strictEqual(result[0].content, ' world ');
    });

    test('should parse substitutions', () => {
        const result = parseCriticMarkup('Hello {~~ world ~> earth ~~}');
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].type, 'substitution');
        assert.strictEqual(result[0].oldText, ' world ');
        assert.strictEqual(result[0].newText, ' earth ');
    });

    test('should parse comments', () => {
        const result = parseCriticMarkup('Hello {>> a comment <<}');
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].type, 'comment');
        assert.strictEqual(result[0].content, ' a comment ');
    });

    test('should parse highlights', () => {
        const result = parseCriticMarkup('Hello {== highlighted ==}');
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].type, 'highlight');
        assert.strictEqual(result[0].content, ' highlighted ');
    });

    test('should parse multiple patterns in one string', () => {
        const text = '{++ added ++} normal {-- deleted --}';
        const result = parseCriticMarkup(text);
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].type, 'addition');
        assert.strictEqual(result[1].type, 'deletion');
    });

    test('should return empty array for text without CriticMarkup', () => {
        const result = parseCriticMarkup('Hello world');
        assert.strictEqual(result.length, 0);
    });

    test('should handle empty input', () => {
        const result = parseCriticMarkup('');
        assert.strictEqual(result.length, 0);
    });
});
