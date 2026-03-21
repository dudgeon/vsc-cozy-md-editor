/**
 * Regex-based parser for CriticMarkup syntax.
 * Handles: additions {++ ++}, deletions {-- --}, substitutions {~~ ~> ~~},
 * comments {>> <<}, highlights {== ==}
 * Reference: https://criticmarkup.com/spec.php
 */

export interface CriticMarkupRange {
    type: 'addition' | 'deletion' | 'substitution' | 'comment' | 'highlight';
    fullMatch: string;
    start: number;
    end: number;
    content: string;
    /** For substitutions: the old text */
    oldText?: string;
    /** For substitutions: the new text */
    newText?: string;
}

const patterns: Array<{ type: CriticMarkupRange['type']; regex: RegExp }> = [
    { type: 'addition', regex: /\{\+\+([\s\S]*?)\+\+\}/g },
    { type: 'deletion', regex: /\{--([\s\S]*?)--\}/g },
    { type: 'substitution', regex: /\{~~([\s\S]*?)~>([\s\S]*?)~~\}/g },
    { type: 'comment', regex: /\{>>([\s\S]*?)<<\}/g },
    { type: 'highlight', regex: /\{==([\s\S]*?)==\}/g },
];

export function parseCriticMarkup(text: string): CriticMarkupRange[] {
    if (!text) {
        return [];
    }

    const results: CriticMarkupRange[] = [];

    for (const { type, regex } of patterns) {
        // Reset regex lastIndex
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
            const range: CriticMarkupRange = {
                type,
                fullMatch: match[0],
                start: match.index,
                end: match.index + match[0].length,
                content: type === 'substitution' ? match[0] : match[1],
            };

            if (type === 'substitution') {
                range.oldText = match[1];
                range.newText = match[2];
            }

            results.push(range);
        }
    }

    // Sort by position
    results.sort((a, b) => a.start - b.start);

    return results;
}
